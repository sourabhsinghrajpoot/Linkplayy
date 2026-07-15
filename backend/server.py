from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import logging
import uuid
import re
import bcrypt
import jwt
import httpx
from datetime import datetime, timezone, timedelta
from typing import Optional, Annotated

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, status
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field, ConfigDict
from bson import ObjectId


# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI(title="LinkPlay API")
api_router = APIRouter(prefix="/api")

JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_MINUTES = 60 * 24  # 1 day for simplicity
REFRESH_TOKEN_DAYS = 7

logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("linkplay")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
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
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")


def serialize_user(u: dict) -> dict:
    return {
        "id": str(u["_id"]),
        "email": u["email"],
        "name": u.get("name", ""),
        "subscription_status": u.get("subscription_status", "free"),
        "subscription_expires_at": u.get("subscription_expires_at"),
        "created_at": u.get("created_at"),
    }


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


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


class TeraboxRequest(BaseModel):
    url: str


class SubscribeInput(BaseModel):
    plan: str = "pro_monthly"  # only one for now


# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------
@api_router.post("/auth/register")
async def register(payload: RegisterInput, response: Response):
    email = payload.email.lower().strip()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user_doc = {
        "email": email,
        "password_hash": hash_password(payload.password),
        "name": (payload.name or "").strip(),
        "role": "user",
        "subscription_status": "free",
        "subscription_expires_at": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    result = await db.users.insert_one(user_doc)
    user_doc["_id"] = result.inserted_id

    access = create_access_token(str(result.inserted_id), email)
    refresh = create_refresh_token(str(result.inserted_id))
    set_auth_cookies(response, access, refresh)
    return serialize_user(user_doc)


@api_router.post("/auth/login")
async def login(payload: LoginInput, response: Response):
    email = payload.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    access = create_access_token(str(user["_id"]), email)
    refresh = create_refresh_token(str(user["_id"]))
    set_auth_cookies(response, access, refresh)
    return serialize_user(user)


@api_router.post("/auth/logout")
async def logout(response: Response):
    clear_auth_cookies(response)
    return {"ok": True}


@api_router.get("/auth/me")
async def get_me(user: dict = Depends(get_current_user)):
    return serialize_user(user)


# ---------------------------------------------------------------------------
# Terabox extraction
# ---------------------------------------------------------------------------
TERABOX_HOSTS = [
    "terabox.com", "terabox.app", "1024tera.com", "4funbox.com", "mirrobox.com",
    "nephobox.com", "terasharelink.com", "teraboxapp.com", "terabox.club", "momerybox.com",
    "1024terabox.com", "freeterabox.com"
]


def is_valid_terabox_url(url: str) -> bool:
    if not url or not isinstance(url, str):
        return False
    return any(h in url.lower() for h in TERABOX_HOSTS)


def normalize_extractor_response(raw: dict) -> Optional[dict]:
    """Normalize different upstream extractor responses to our unified schema."""
    if not isinstance(raw, dict):
        return None

    # wdzone-style: {"✅ Status":"Success","📜 Extracted Info":[{...}]}
    extracted = raw.get("📜 Extracted Info") or raw.get("Extracted Info") or raw.get("extracted_info")
    if isinstance(extracted, list) and extracted:
        item = extracted[0]
        return {
            "title": item.get("📂 Title") or item.get("Title") or item.get("title") or "Terabox Video",
            "size": item.get("📏 Size") or item.get("Size") or item.get("size") or "",
            "thumbnail": item.get("🖼️ Thumbnails", {}).get("360x270") if isinstance(item.get("🖼️ Thumbnails"), dict)
                         else (item.get("Thumbnail") or item.get("thumbnail") or ""),
            "download_url": item.get("🔽 Direct Download Link") or item.get("Direct Download Link")
                            or item.get("download") or item.get("dlink") or item.get("direct_link") or "",
        }

    # Compact style: {"filename","size","download","thumbs"}
    if raw.get("download") or raw.get("downloadLink") or raw.get("direct_link") or raw.get("dlink"):
        return {
            "title": raw.get("filename") or raw.get("title") or raw.get("server_filename") or "Terabox Video",
            "size": raw.get("size") or "",
            "thumbnail": raw.get("thumbs") or raw.get("thumbnail") or "",
            "download_url": raw.get("download") or raw.get("downloadLink") or raw.get("direct_link") or raw.get("dlink") or "",
        }

    # baidu-style with "list"
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
async def extract_terabox(payload: TeraboxRequest):
    url = payload.url.strip()
    if not is_valid_terabox_url(url):
        raise HTTPException(status_code=400, detail="Not a valid Terabox link")

    api_base = os.environ.get("TERABOX_API_URL", "https://wdzone-terabox-api.vercel.app/api")

    try:
        async with httpx.AsyncClient(timeout=25.0, follow_redirects=True) as hc:
            # Most community extractors accept GET with ?url=
            resp = await hc.get(api_base, params={"url": url})
            if resp.status_code != 200:
                # fallback: try POST
                resp = await hc.post(api_base, json={"url": url})
    except httpx.HTTPError as e:
        logger.warning(f"Terabox extractor request failed: {e}")
        raise HTTPException(status_code=502, detail="Extractor service unreachable. Please try again shortly or set a custom TERABOX_API_URL.")

    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Extractor returned {resp.status_code}")

    try:
        raw = resp.json()
    except Exception:
        raise HTTPException(status_code=502, detail="Extractor returned invalid JSON")

    unified = normalize_extractor_response(raw)
    if not unified or not unified.get("download_url"):
        raise HTTPException(status_code=422, detail="Could not extract this Terabox link. It may be private, expired, or unsupported.")

    return {
        "ok": True,
        "id": str(uuid.uuid4()),
        "source_url": url,
        **unified,
    }


# ---------------------------------------------------------------------------
# Subscription (MOCK Razorpay)
# ---------------------------------------------------------------------------
@api_router.post("/subscribe/mock")
async def subscribe_mock(payload: SubscribeInput, user: dict = Depends(get_current_user)):
    """MOCK subscription — instantly marks user as pro for 30 days.
    Replace with real Razorpay verification when keys are provided."""
    expires = datetime.now(timezone.utc) + timedelta(days=30)
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {
            "subscription_status": "pro",
            "subscription_expires_at": expires.isoformat(),
            "subscription_plan": payload.plan,
        }}
    )
    fresh = await db.users.find_one({"_id": user["_id"]})
    return {"ok": True, "user": serialize_user(fresh), "mock": True}


@api_router.get("/subscribe/status")
async def subscribe_status(user: dict = Depends(get_current_user)):
    return {
        "status": user.get("subscription_status", "free"),
        "expires_at": user.get("subscription_expires_at"),
    }


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
@api_router.get("/")
async def root():
    return {"service": "LinkPlay API", "status": "ok"}


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------
@app.on_event("startup")
async def startup():
    try:
        await db.users.create_index("email", unique=True)
        logger.info("MongoDB indexes ready")
    except Exception as e:
        logger.warning(f"Index creation issue: {e}")


@app.on_event("shutdown")
async def shutdown():
    client.close()


# ---------------------------------------------------------------------------
# Middleware & router mount
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
