from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import uuid
import hmac
import hashlib
import logging
import bcrypt
import jwt
import httpx
from datetime import datetime, timezone, timedelta
from typing import Optional, List

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field, ConfigDict
from bson import ObjectId

# Optional Razorpay client (only used in live mode)
try:
    import razorpay  # noqa
except Exception:
    razorpay = None


# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI(title="LinkPlay API")
api_router = APIRouter(prefix="/api")

JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_MINUTES = 60 * 24            # 1 day
REFRESH_TOKEN_DAYS = 7
FREE_DAILY_LIMIT = int(os.environ.get("FREE_DAILY_LIMIT", "3"))

logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("linkplay")


# ---------------------------------------------------------------------------
# Password + JWT helpers
# ---------------------------------------------------------------------------
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_MINUTES),
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "type": "refresh",
        "exp": datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_DAYS),
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def set_auth_cookies(response: Response, access: str, refresh: str) -> None:
    response.set_cookie("access_token", access, httponly=True, secure=True,
                        samesite="none", max_age=ACCESS_TOKEN_MINUTES * 60, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=True,
                        samesite="none", max_age=REFRESH_TOKEN_DAYS * 86400, path="/")


def clear_auth_cookies(response: Response) -> None:
    response.delete_cookie("access_token", path="/", secure=True, samesite="none", httponly=True)
    response.delete_cookie("refresh_token", path="/", secure=True, samesite="none", httponly=True)


# ---------------------------------------------------------------------------
# User serialization + subscription check
# ---------------------------------------------------------------------------
def _sub_active(user: dict) -> bool:
    if user.get("subscription_status") != "pro":
        return False
    exp = user.get("subscription_expires_at")
    if not exp:
        return False
    if isinstance(exp, str):
        try:
            exp = datetime.fromisoformat(exp)
        except Exception:
            return False
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    return exp > datetime.now(timezone.utc)


def serialize_user(u: dict) -> dict:
    pro = _sub_active(u)
    return {
        "id": str(u["_id"]),
        "email": u.get("email"),
        "name": u.get("name", ""),
        "picture": u.get("picture", ""),
        "auth_provider": u.get("auth_provider", "password"),
        "subscription_status": "pro" if pro else "free",
        "subscription_expires_at": u.get("subscription_expires_at"),
        "subscription_plan": u.get("subscription_plan"),
        "preferences": u.get("preferences", {}),
        "created_at": u.get("created_at"),
    }


async def get_current_user_optional(request: Request) -> Optional[dict]:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        return None
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            return None
        try:
            oid = ObjectId(payload["sub"])
        except Exception:
            return None
        user = await db.users.find_one({"_id": oid})
        return user
    except jwt.PyJWTError:
        return None


async def get_current_user(request: Request) -> dict:
    user = await get_current_user_optional(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


# ---------------------------------------------------------------------------
# Rate limiting (server-side, MongoDB TTL)
# ---------------------------------------------------------------------------
def _today_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


async def check_and_consume_quota(user: Optional[dict], request: Request) -> dict:
    """Returns {used, limit, remaining, is_pro}. Raises 429 if over limit."""
    if user and _sub_active(user):
        return {"used": 0, "limit": -1, "remaining": -1, "is_pro": True}

    # Identify: user_id if logged-in else IP
    if user:
        identifier = f"user:{user['_id']}"
    else:
        ip = request.client.host if request.client else "unknown"
        xff = request.headers.get("x-forwarded-for", "")
        if xff:
            ip = xff.split(",")[0].strip()
        identifier = f"ip:{ip}"

    day = _today_str()
    doc_key = {"identifier": identifier, "day": day}

    existing = await db.rate_limits.find_one(doc_key)
    used = (existing or {}).get("count", 0)
    if used >= FREE_DAILY_LIMIT:
        raise HTTPException(
            status_code=429,
            detail=f"Daily free limit reached ({FREE_DAILY_LIMIT}/day). Upgrade to Pro for unlimited playback.",
        )

    # increment atomically
    expires_at = datetime.now(timezone.utc) + timedelta(hours=36)
    await db.rate_limits.update_one(
        doc_key,
        {"$inc": {"count": 1}, "$set": {"expires_at": expires_at}},
        upsert=True,
    )
    return {"used": used + 1, "limit": FREE_DAILY_LIMIT, "remaining": max(0, FREE_DAILY_LIMIT - used - 1), "is_pro": False}


async def get_quota_status(user: Optional[dict], request: Request) -> dict:
    if user and _sub_active(user):
        return {"used": 0, "limit": -1, "remaining": -1, "is_pro": True}

    if user:
        identifier = f"user:{user['_id']}"
    else:
        ip = request.client.host if request.client else "unknown"
        xff = request.headers.get("x-forwarded-for", "")
        if xff:
            ip = xff.split(",")[0].strip()
        identifier = f"ip:{ip}"

    doc = await db.rate_limits.find_one({"identifier": identifier, "day": _today_str()})
    used = (doc or {}).get("count", 0)
    return {"used": used, "limit": FREE_DAILY_LIMIT, "remaining": max(0, FREE_DAILY_LIMIT - used), "is_pro": False}


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class RegisterInput(BaseModel):
    model_config = ConfigDict(extra="ignore")
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    name: Optional[str] = ""


class LoginInput(BaseModel):
    model_config = ConfigDict(extra="ignore")
    email: EmailStr
    password: str


class GoogleSessionInput(BaseModel):
    session_id: str


class TeraboxRequest(BaseModel):
    url: str


class SubscribeCreateInput(BaseModel):
    plan: str = "pro_monthly"


class SubscribeVerifyInput(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


class HistoryItem(BaseModel):
    source_url: str
    title: Optional[str] = ""
    size: Optional[str] = ""
    thumbnail: Optional[str] = ""
    download_url: Optional[str] = ""


class ContinueWatchingInput(BaseModel):
    source_url: str
    position_seconds: float
    duration_seconds: Optional[float] = 0
    title: Optional[str] = ""
    thumbnail: Optional[str] = ""


class PreferencesInput(BaseModel):
    autoplay: Optional[bool] = None
    theme: Optional[str] = None  # "dark" for now
    default_quality: Optional[str] = None  # "auto" | "hd" | "sd"


# ---------------------------------------------------------------------------
# Auth: Email/Password
# ---------------------------------------------------------------------------
@api_router.post("/auth/register")
async def register(payload: RegisterInput, response: Response):
    email = payload.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")

    doc = {
        "email": email,
        "password_hash": hash_password(payload.password),
        "name": (payload.name or "").strip(),
        "picture": "",
        "auth_provider": "password",
        "role": "user",
        "subscription_status": "free",
        "subscription_expires_at": None,
        "subscription_plan": None,
        "preferences": {"autoplay": True, "theme": "dark", "default_quality": "auto"},
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    result = await db.users.insert_one(doc)
    doc["_id"] = result.inserted_id

    set_auth_cookies(response,
                     create_access_token(str(result.inserted_id), email),
                     create_refresh_token(str(result.inserted_id)))
    return serialize_user(doc)


@api_router.post("/auth/login")
async def login(payload: LoginInput, response: Response):
    email = payload.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not user.get("password_hash") or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    set_auth_cookies(response,
                     create_access_token(str(user["_id"]), email),
                     create_refresh_token(str(user["_id"])))
    return serialize_user(user)


@api_router.post("/auth/logout")
async def logout(response: Response):
    clear_auth_cookies(response)
    return {"ok": True}


@api_router.get("/auth/me")
async def get_me(user: dict = Depends(get_current_user)):
    return serialize_user(user)


# ---------------------------------------------------------------------------
# Auth: Google (Emergent-managed OAuth)
# ---------------------------------------------------------------------------
@api_router.post("/auth/google/session")
async def google_session_exchange(payload: GoogleSessionInput, response: Response):
    """Exchange Emergent OAuth session_id for our own JWT cookies.
    Called from AuthCallback on the frontend."""
    session_url = os.environ.get(
        "EMERGENT_AUTH_SESSION_URL",
        "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
    )
    try:
        async with httpx.AsyncClient(timeout=15.0) as hc:
            r = await hc.get(session_url, headers={"X-Session-ID": payload.session_id})
    except httpx.HTTPError as e:
        logger.warning(f"Emergent auth request failed: {e}")
        raise HTTPException(status_code=502, detail="Google auth service unreachable")

    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid or expired Google session")

    try:
        data = r.json()
    except Exception:
        raise HTTPException(status_code=502, detail="Invalid Google session response")

    email = (data.get("email") or "").lower().strip()
    if not email:
        raise HTTPException(status_code=400, detail="Google account missing email")

    existing = await db.users.find_one({"email": email})
    if existing:
        # ensure google metadata is stored
        await db.users.update_one(
            {"_id": existing["_id"]},
            {"$set": {
                "auth_provider": existing.get("auth_provider", "google"),
                "google_id": data.get("id"),
                "picture": data.get("picture", existing.get("picture", "")),
                "name": existing.get("name") or data.get("name", ""),
            }},
        )
        user_doc = await db.users.find_one({"_id": existing["_id"]})
    else:
        new_doc = {
            "email": email,
            "password_hash": None,
            "name": data.get("name", ""),
            "picture": data.get("picture", ""),
            "auth_provider": "google",
            "google_id": data.get("id"),
            "role": "user",
            "subscription_status": "free",
            "subscription_expires_at": None,
            "subscription_plan": None,
            "preferences": {"autoplay": True, "theme": "dark", "default_quality": "auto"},
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        result = await db.users.insert_one(new_doc)
        new_doc["_id"] = result.inserted_id
        user_doc = new_doc

    set_auth_cookies(response,
                     create_access_token(str(user_doc["_id"]), email),
                     create_refresh_token(str(user_doc["_id"])))
    return serialize_user(user_doc)


# ---------------------------------------------------------------------------
# Preferences
# ---------------------------------------------------------------------------
@api_router.get("/preferences")
async def get_preferences(user: dict = Depends(get_current_user)):
    return user.get("preferences", {})


@api_router.patch("/preferences")
async def update_preferences(payload: PreferencesInput, user: dict = Depends(get_current_user)):
    updates = {f"preferences.{k}": v for k, v in payload.model_dump(exclude_none=True).items()}
    if updates:
        await db.users.update_one({"_id": user["_id"]}, {"$set": updates})
    fresh = await db.users.find_one({"_id": user["_id"]})
    return fresh.get("preferences", {})


# ---------------------------------------------------------------------------
# Terabox extractor (with server-side rate limiting)
# ---------------------------------------------------------------------------
TERABOX_HOSTS = [
    "terabox.com", "terabox.app", "1024tera.com", "4funbox.com", "mirrobox.com",
    "nephobox.com", "terasharelink.com", "teraboxapp.com", "terabox.club",
    "momerybox.com", "1024terabox.com", "freeterabox.com",
]


def is_valid_terabox_url(url: str) -> bool:
    if not url or not isinstance(url, str):
        return False
    return any(h in url.lower() for h in TERABOX_HOSTS)


def normalize_extractor_response(raw: dict) -> Optional[dict]:
    if not isinstance(raw, dict):
        return None

    # wdzone-style
    extracted = raw.get("📜 Extracted Info") or raw.get("Extracted Info") or raw.get("extracted_info")
    if isinstance(extracted, list) and extracted:
        item = extracted[0]
        thumbs = item.get("🖼️ Thumbnails")
        thumb = ""
        if isinstance(thumbs, dict):
            thumb = thumbs.get("360x270") or thumbs.get("140x90") or ""
        return {
            "title": item.get("📂 Title") or item.get("Title") or item.get("title") or "Terabox Video",
            "size": item.get("📏 Size") or item.get("Size") or item.get("size") or "",
            "thumbnail": thumb or item.get("Thumbnail") or item.get("thumbnail") or "",
            "download_url": item.get("🔽 Direct Download Link") or item.get("Direct Download Link")
                            or item.get("download") or item.get("dlink") or item.get("direct_link") or "",
        }

    # compact style
    if raw.get("download") or raw.get("downloadLink") or raw.get("direct_link") or raw.get("dlink"):
        return {
            "title": raw.get("filename") or raw.get("title") or raw.get("server_filename") or "Terabox Video",
            "size": raw.get("size") or "",
            "thumbnail": raw.get("thumbs") or raw.get("thumbnail") or "",
            "download_url": raw.get("download") or raw.get("downloadLink") or raw.get("direct_link") or raw.get("dlink") or "",
        }

    # baidu-style
    lst = raw.get("list")
    if isinstance(lst, list) and lst:
        item = lst[0]
        thumbs = item.get("thumbs") or {}
        thumb_url = ""
        if isinstance(thumbs, dict):
            thumb_url = thumbs.get("url3") or thumbs.get("url2") or thumbs.get("url1") or thumbs.get("icon") or ""
        size_bytes = item.get("size")
        size_str = ""
        if isinstance(size_bytes, (int, float)) and size_bytes:
            s = float(size_bytes)
            for unit in ["B", "KB", "MB", "GB", "TB"]:
                if s < 1024:
                    size_str = f"{s:.2f} {unit}"
                    break
                s /= 1024
        return {
            "title": item.get("server_filename") or item.get("title") or "Terabox Video",
            "size": size_str,
            "thumbnail": thumb_url,
            "download_url": item.get("dlink") or item.get("direct_link") or item.get("stream_url") or "",
        }
    return None


@api_router.post("/terabox/extract")
async def extract_terabox(payload: TeraboxRequest, request: Request):
    url = payload.url.strip()
    if not is_valid_terabox_url(url):
        raise HTTPException(status_code=400, detail="Not a valid Terabox link")

    current_user = await get_current_user_optional(request)

    # Enforce quota BEFORE calling upstream
    quota = await check_and_consume_quota(current_user, request)

    api_base = os.environ.get("TERABOX_API_URL", "https://wdzone-terabox-api.vercel.app/api")

    try:
        async with httpx.AsyncClient(timeout=25.0, follow_redirects=True) as hc:
            resp = await hc.get(api_base, params={"url": url})
            if resp.status_code != 200:
                resp = await hc.post(api_base, json={"url": url})
    except httpx.HTTPError as e:
        # rollback: refund quota since call failed
        await _refund_quota(current_user, request)
        logger.warning(f"Terabox extractor request failed: {e}")
        raise HTTPException(status_code=502, detail="Extractor service unreachable. Please try again shortly.")

    if resp.status_code != 200:
        await _refund_quota(current_user, request)
        raise HTTPException(status_code=502, detail=f"Extractor returned {resp.status_code}")

    try:
        raw = resp.json()
    except Exception:
        await _refund_quota(current_user, request)
        raise HTTPException(status_code=502, detail="Extractor returned invalid JSON")

    unified = normalize_extractor_response(raw)
    if not unified or not unified.get("download_url"):
        await _refund_quota(current_user, request)
        raise HTTPException(status_code=422, detail="Could not extract this Terabox link. It may be private, expired, or unsupported.")

    return {
        "ok": True,
        "id": str(uuid.uuid4()),
        "source_url": url,
        "quota": quota,
        **unified,
    }


async def _refund_quota(user: Optional[dict], request: Request) -> None:
    if user and _sub_active(user):
        return
    if user:
        identifier = f"user:{user['_id']}"
    else:
        ip = request.client.host if request.client else "unknown"
        xff = request.headers.get("x-forwarded-for", "")
        if xff:
            ip = xff.split(",")[0].strip()
        identifier = f"ip:{ip}"
    await db.rate_limits.update_one(
        {"identifier": identifier, "day": _today_str()},
        {"$inc": {"count": -1}},
    )


@api_router.get("/quota")
async def quota_endpoint(request: Request):
    current_user = await get_current_user_optional(request)
    return await get_quota_status(current_user, request)


# ---------------------------------------------------------------------------
# History
# ---------------------------------------------------------------------------
@api_router.get("/history")
async def list_history(user: dict = Depends(get_current_user)):
    cur = db.history.find({"user_id": str(user["_id"])}, {"_id": 0}).sort("played_at", -1).limit(50)
    return await cur.to_list(50)


@api_router.post("/history")
async def save_history(payload: HistoryItem, user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc).isoformat()
    uid = str(user["_id"])
    # dedupe: remove previous entries for same URL then insert fresh
    await db.history.delete_many({"user_id": uid, "source_url": payload.source_url})
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": uid,
        "source_url": payload.source_url,
        "title": payload.title or "",
        "size": payload.size or "",
        "thumbnail": payload.thumbnail or "",
        "played_at": now,
    }
    await db.history.insert_one(doc)

    # cap to 50 latest
    old = await db.history.find({"user_id": uid}, {"_id": 1}).sort("played_at", -1).skip(50).to_list(1000)
    if old:
        await db.history.delete_many({"_id": {"$in": [o["_id"] for o in old]}})

    doc.pop("_id", None)
    return doc


@api_router.delete("/history")
async def clear_history(user: dict = Depends(get_current_user)):
    await db.history.delete_many({"user_id": str(user["_id"])})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Favorites
# ---------------------------------------------------------------------------
@api_router.get("/favorites")
async def list_favorites(user: dict = Depends(get_current_user)):
    cur = db.favorites.find({"user_id": str(user["_id"])}, {"_id": 0}).sort("added_at", -1).limit(100)
    return await cur.to_list(100)


@api_router.post("/favorites")
async def add_favorite(payload: HistoryItem, user: dict = Depends(get_current_user)):
    uid = str(user["_id"])
    existing = await db.favorites.find_one({"user_id": uid, "source_url": payload.source_url})
    if existing:
        raise HTTPException(status_code=400, detail="Already in favorites")
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": uid,
        "source_url": payload.source_url,
        "title": payload.title or "",
        "size": payload.size or "",
        "thumbnail": payload.thumbnail or "",
        "added_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.favorites.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.delete("/favorites")
async def remove_favorite(source_url: str, user: dict = Depends(get_current_user)):
    res = await db.favorites.delete_one({"user_id": str(user["_id"]), "source_url": source_url})
    return {"ok": res.deleted_count > 0}


# ---------------------------------------------------------------------------
# Continue Watching
# ---------------------------------------------------------------------------
@api_router.get("/continue-watching")
async def list_continue(user: dict = Depends(get_current_user)):
    cur = db.continue_watching.find({"user_id": str(user["_id"])}, {"_id": 0}).sort("updated_at", -1).limit(20)
    return await cur.to_list(20)


@api_router.post("/continue-watching")
async def save_continue(payload: ContinueWatchingInput, user: dict = Depends(get_current_user)):
    uid = str(user["_id"])
    now = datetime.now(timezone.utc).isoformat()
    # if fully watched (>95%), remove instead of storing
    if payload.duration_seconds and payload.duration_seconds > 0 and \
       payload.position_seconds / payload.duration_seconds > 0.95:
        await db.continue_watching.delete_one({"user_id": uid, "source_url": payload.source_url})
        return {"ok": True, "removed": True}

    doc = {
        "user_id": uid,
        "source_url": payload.source_url,
        "position_seconds": payload.position_seconds,
        "duration_seconds": payload.duration_seconds or 0,
        "title": payload.title or "",
        "thumbnail": payload.thumbnail or "",
        "updated_at": now,
    }
    await db.continue_watching.update_one(
        {"user_id": uid, "source_url": payload.source_url},
        {"$set": doc},
        upsert=True,
    )
    return {"ok": True, **doc}


@api_router.delete("/continue-watching")
async def clear_continue(source_url: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {"user_id": str(user["_id"])}
    if source_url:
        q["source_url"] = source_url
    await db.continue_watching.delete_many(q)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Subscription (Razorpay live + mock fallback)
# ---------------------------------------------------------------------------
def _razorpay_mode() -> str:
    mode = (os.environ.get("RAZORPAY_MODE") or "").strip().lower()
    key_id = (os.environ.get("RAZORPAY_KEY_ID") or "").strip()
    key_secret = (os.environ.get("RAZORPAY_KEY_SECRET") or "").strip()
    if mode == "live" and key_id and key_secret and razorpay is not None:
        return "live"
    return "mock"


def _razorpay_client():
    return razorpay.Client(auth=(os.environ["RAZORPAY_KEY_ID"], os.environ["RAZORPAY_KEY_SECRET"]))


@api_router.get("/subscribe/config")
async def subscribe_config():
    return {
        "mode": _razorpay_mode(),
        "key_id": os.environ.get("RAZORPAY_KEY_ID", "") if _razorpay_mode() == "live" else "",
        "amount_paise": int(os.environ.get("RAZORPAY_PRO_AMOUNT_PAISE", "4900")),
        "currency": "INR",
        "plan_name": "LinkPlay Pro (Monthly)",
    }


@api_router.post("/subscribe/create-order")
async def create_order(payload: SubscribeCreateInput, user: dict = Depends(get_current_user)):
    amount = int(os.environ.get("RAZORPAY_PRO_AMOUNT_PAISE", "4900"))
    if _razorpay_mode() == "mock":
        return {
            "mode": "mock",
            "order_id": f"mock_order_{uuid.uuid4().hex[:12]}",
            "amount": amount,
            "currency": "INR",
        }

    try:
        client_rz = _razorpay_client()
        order = client_rz.order.create({
            "amount": amount,
            "currency": "INR",
            "receipt": f"lp_{str(user['_id'])[:20]}_{int(datetime.now(timezone.utc).timestamp())}"[:40],
            "payment_capture": 1,
            "notes": {"plan": payload.plan, "user_id": str(user["_id"])},
        })
    except Exception as e:
        logger.exception("Razorpay order creation failed")
        raise HTTPException(status_code=502, detail=f"Razorpay error: {e}")

    await db.orders.insert_one({
        "order_id": order["id"],
        "user_id": str(user["_id"]),
        "amount": amount,
        "currency": "INR",
        "plan": payload.plan,
        "status": "created",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {
        "mode": "live",
        "order_id": order["id"],
        "amount": amount,
        "currency": "INR",
        "key_id": os.environ.get("RAZORPAY_KEY_ID", ""),
    }


async def _activate_pro(user_id: str, plan: str = "pro_monthly", payment_id: Optional[str] = None):
    expires = datetime.now(timezone.utc) + timedelta(days=30)
    await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {
            "subscription_status": "pro",
            "subscription_expires_at": expires.isoformat(),
            "subscription_plan": plan,
            "last_payment_id": payment_id,
        }},
    )
    return expires


@api_router.post("/subscribe/verify")
async def verify_payment(payload: SubscribeVerifyInput, user: dict = Depends(get_current_user)):
    if _razorpay_mode() == "mock":
        raise HTTPException(status_code=400, detail="Razorpay live mode is not configured")

    # verify signature
    key_secret = os.environ.get("RAZORPAY_KEY_SECRET", "").encode()
    msg = f"{payload.razorpay_order_id}|{payload.razorpay_payment_id}".encode()
    expected = hmac.new(key_secret, msg, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, payload.razorpay_signature):
        raise HTTPException(status_code=400, detail="Invalid payment signature")

    await db.orders.update_one(
        {"order_id": payload.razorpay_order_id, "user_id": str(user["_id"])},
        {"$set": {
            "status": "paid",
            "payment_id": payload.razorpay_payment_id,
            "paid_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    await _activate_pro(str(user["_id"]), plan="pro_monthly", payment_id=payload.razorpay_payment_id)
    fresh = await db.users.find_one({"_id": user["_id"]})
    return {"ok": True, "user": serialize_user(fresh)}


@api_router.post("/subscribe/mock")
async def subscribe_mock(payload: SubscribeCreateInput, user: dict = Depends(get_current_user)):
    """MOCK subscription - only allowed when RAZORPAY_MODE!=live."""
    if _razorpay_mode() == "live":
        raise HTTPException(status_code=400, detail="Mock subscribe is disabled in live mode")
    await _activate_pro(str(user["_id"]), plan=payload.plan, payment_id=f"mock_{uuid.uuid4().hex[:16]}")
    fresh = await db.users.find_one({"_id": user["_id"]})
    return {"ok": True, "mock": True, "user": serialize_user(fresh)}


@api_router.get("/subscribe/status")
async def subscribe_status(user: dict = Depends(get_current_user)):
    pro = _sub_active(user)
    return {
        "status": "pro" if pro else "free",
        "expires_at": user.get("subscription_expires_at") if pro else None,
        "plan": user.get("subscription_plan") if pro else None,
    }


@api_router.post("/webhook/razorpay")
async def razorpay_webhook(request: Request):
    body = await request.body()
    signature = request.headers.get("X-Razorpay-Signature", "")
    secret = os.environ.get("RAZORPAY_WEBHOOK_SECRET", "").encode()
    if not secret:
        raise HTTPException(status_code=400, detail="Webhook secret not configured")

    expected = hmac.new(secret, body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    try:
        import json
        payload = json.loads(body.decode())
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event = payload.get("event", "")
    entity = payload.get("payload", {}).get("payment", {}).get("entity") or \
             payload.get("payload", {}).get("order", {}).get("entity") or {}
    order_id = entity.get("order_id") or entity.get("id")
    payment_id = entity.get("id")

    logger.info(f"Razorpay webhook event={event} order_id={order_id}")

    if event in ("payment.captured", "order.paid") and order_id:
        order_doc = await db.orders.find_one({"order_id": order_id})
        if order_doc:
            await _activate_pro(order_doc["user_id"], plan=order_doc.get("plan", "pro_monthly"), payment_id=payment_id)
            await db.orders.update_one(
                {"order_id": order_id},
                {"$set": {"status": "paid", "payment_id": payment_id,
                          "paid_at": datetime.now(timezone.utc).isoformat()}},
            )
    return {"ok": True}


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
@api_router.get("/")
async def root():
    return {
        "service": "LinkPlay API",
        "status": "ok",
        "razorpay_mode": _razorpay_mode(),
        "free_daily_limit": FREE_DAILY_LIMIT,
    }


# ---------------------------------------------------------------------------
# Startup: indexes
# ---------------------------------------------------------------------------
@app.on_event("startup")
async def startup():
    try:
        await db.users.create_index("email", unique=True)
        await db.rate_limits.create_index([("identifier", 1), ("day", 1)], unique=True)
        await db.rate_limits.create_index("expires_at", expireAfterSeconds=0)
        await db.history.create_index([("user_id", 1), ("played_at", -1)])
        await db.history.create_index([("user_id", 1), ("source_url", 1)])
        await db.favorites.create_index([("user_id", 1), ("source_url", 1)], unique=True)
        await db.favorites.create_index([("user_id", 1), ("added_at", -1)])
        await db.continue_watching.create_index([("user_id", 1), ("source_url", 1)], unique=True)
        await db.continue_watching.create_index([("user_id", 1), ("updated_at", -1)])
        await db.orders.create_index("order_id", unique=True)
        await db.orders.create_index([("user_id", 1), ("created_at", -1)])
        logger.info(f"MongoDB indexes ready • Razorpay mode: {_razorpay_mode()}")
    except Exception as e:
        logger.warning(f"Index creation issue: {e}")


@app.on_event("shutdown")
async def shutdown():
    client.close()


# ---------------------------------------------------------------------------
# CORS + router mount
# ---------------------------------------------------------------------------
app.include_router(api_router)

_cors_env = os.environ.get('CORS_ORIGINS', '*')
_frontend_url = os.environ.get('FRONTEND_URL', '').strip()
if _cors_env == '*' and _frontend_url:
    _origins = [_frontend_url]
else:
    _origins = [o.strip() for o in _cors_env.split(',') if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=_origins or ['*'],
    allow_origin_regex=r"https://.*\.emergentagent\.com" if _origins == ['*'] else None,
    allow_methods=["*"],
    allow_headers=["*"],
)
