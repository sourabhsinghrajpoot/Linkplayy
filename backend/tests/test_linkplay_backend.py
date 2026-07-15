"""
LinkPlay backend regression tests - iteration 2
Covers:
- Root/config endpoints
- Auth (register/login/me/logout) - already covered in iter 1; smoke here
- Quota endpoint + rate limiting on /api/terabox/extract (IP-based)
- Non-terabox url does not consume quota
- Fake terabox url quota refund
- Preferences GET/PATCH
- History CRUD + dedupe
- Favorites CRUD + dup 400
- Continue-watching upsert / auto-remove >0.95 / delete
- Google session invalid session_id
- Subscribe config/create-order (mock)
- subscribe/mock upgrade -> quota is_pro=true
- subscribe/verify blocked in mock mode
- Webhook invalid signature
"""

import os
import time
import pymongo
import pytest
import requests


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or \
           __import__("dotenv").dotenv_values(
               __import__("pathlib").Path(__file__).resolve().parents[2] / "frontend" / ".env"
           ).get("REACT_APP_BACKEND_URL", "").rstrip("/")


# -----------------------
# Root / config
# -----------------------
def test_root_returns_mode_and_limit(api_client):
    r = api_client.get(f"{BASE_URL}/api/")
    assert r.status_code == 200
    data = r.json()
    assert data.get("razorpay_mode") == "mock"
    assert data.get("free_daily_limit") == 3


def test_subscribe_config_mock(api_client):
    r = api_client.get(f"{BASE_URL}/api/subscribe/config")
    assert r.status_code == 200
    data = r.json()
    assert data["mode"] == "mock"
    assert data["amount_paise"] == 4900
    assert data["currency"] == "INR"
    assert data["key_id"] == ""  # empty in mock


# -----------------------
# Quota (unauth)
# -----------------------
def test_quota_unauthenticated_defaults(api_client):
    # Clean rate limits first
    try:
        c = pymongo.MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
        c[os.environ.get("DB_NAME", "test_database")]["rate_limits"].delete_many({})
    except Exception:
        pass
    r = api_client.get(f"{BASE_URL}/api/quota")
    assert r.status_code == 200
    data = r.json()
    assert data["limit"] == 3
    assert data["is_pro"] is False
    assert data["used"] == 0
    assert data["remaining"] == 3


# -----------------------
# Terabox extract - validation before quota
# -----------------------
def test_non_terabox_url_returns_400_without_consuming_quota(api_client):
    # Clean rate limits
    c = pymongo.MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
    c[os.environ.get("DB_NAME", "test_database")]["rate_limits"].delete_many({})

    before = api_client.get(f"{BASE_URL}/api/quota").json()
    r = api_client.post(f"{BASE_URL}/api/terabox/extract",
                        json={"url": "https://youtube.com/watch?v=abc"})
    assert r.status_code == 400
    assert "not a valid terabox" in r.json()["detail"].lower()

    after = api_client.get(f"{BASE_URL}/api/quota").json()
    assert after["used"] == before["used"], "Quota should not change on 400 validation error"


# -----------------------
# Terabox extract - fake url -> 422 with refund
# -----------------------
def test_fake_terabox_url_refunds_quota(api_client):
    c = pymongo.MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
    c[os.environ.get("DB_NAME", "test_database")]["rate_limits"].delete_many({})

    before = api_client.get(f"{BASE_URL}/api/quota").json()
    r = api_client.post(f"{BASE_URL}/api/terabox/extract",
                        json={"url": "https://terabox.com/s/1nonexistent_fake_url_zzz"})
    # Expect upstream to fail -> 422 or 502
    assert r.status_code in (422, 502), f"Got {r.status_code}: {r.text}"

    after = api_client.get(f"{BASE_URL}/api/quota").json()
    assert after["used"] == before["used"], (
        f"Quota should be refunded on upstream failure. before={before} after={after}"
    )


# -----------------------
# Rate limiting: 3 successful attempts -> 4th 429
# NOTE: For this to be deterministic we would need a working upstream. Since
# our fake terabox URLs get refunded, we test the "over limit" path by
# pre-seeding rate_limits with count=3 for our current IP.
# -----------------------
def test_rate_limit_over_quota_returns_429(api_client):
    from datetime import datetime, timezone
    c = pymongo.MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
    coll = c[os.environ.get("DB_NAME", "test_database")]["rate_limits"]
    coll.delete_many({})

    # Discover our identifier by calling /api/quota then reading collection
    # (server writes only on consume; here we manually insert docs for both
    # potential IPs.) We insert count=3 for the wildcard document(s) covering
    # today so the next request should be 429.
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # Hit terabox with a valid host but fake link once - this will consume+refund
    # We'll instead directly seed a doc using the ip we detect via a temporary
    # non-consuming call. Easier: consume once via a fake url (will refund),
    # so we get zero count. Instead, seed for every likely ip in xff header.
    # Simpler approach: seed with a wildcard and use xff header to control identifier.

    xff_ip = "203.0.113.99"
    coll.update_one(
        {"identifier": f"ip:{xff_ip}", "day": day},
        {"$set": {"count": 3, "expires_at": datetime.now(timezone.utc)}},
        upsert=True,
    )

    r = api_client.post(
        f"{BASE_URL}/api/terabox/extract",
        json={"url": "https://terabox.com/s/1abcxyz"},
        headers={"X-Forwarded-For": xff_ip},
    )
    assert r.status_code == 429, f"Expected 429 got {r.status_code}: {r.text}"
    assert "daily free limit reached" in r.json()["detail"].lower()
    assert "3/day" in r.json()["detail"]


# -----------------------
# Register + defaults
# -----------------------
def test_register_defaults(api_client, fresh_email):
    r = api_client.post(f"{BASE_URL}/api/auth/register",
                        json={"email": fresh_email, "password": "password123", "name": "Fresh"})
    assert r.status_code == 200, r.text
    u = r.json()
    assert u["email"] == fresh_email
    assert u["subscription_status"] == "free"
    assert u["auth_provider"] == "password"
    assert u["preferences"] == {"autoplay": True, "theme": "dark", "default_quality": "auto"}


# -----------------------
# Preferences
# -----------------------
def test_preferences_get_and_patch(registered_client):
    s, _ = registered_client
    r = s.get(f"{BASE_URL}/api/preferences")
    assert r.status_code == 200
    prefs = r.json()
    assert prefs.get("autoplay") is True
    assert prefs.get("theme") == "dark"

    r2 = s.patch(f"{BASE_URL}/api/preferences", json={"autoplay": False})
    assert r2.status_code == 200
    updated = r2.json()
    assert updated["autoplay"] is False
    assert updated["theme"] == "dark"

    # Persistence via GET
    r3 = s.get(f"{BASE_URL}/api/preferences")
    assert r3.json()["autoplay"] is False


# -----------------------
# History
# -----------------------
def test_history_crud_and_dedupe(registered_client):
    s, _ = registered_client
    src = "https://terabox.com/s/1testhistory"
    r1 = s.post(f"{BASE_URL}/api/history", json={"source_url": src, "title": "Sample"})
    assert r1.status_code == 200
    r2 = s.get(f"{BASE_URL}/api/history")
    assert r2.status_code == 200
    entries = [e for e in r2.json() if e["source_url"] == src]
    assert len(entries) == 1
    first_played = entries[0]["played_at"]

    time.sleep(1.05)
    r3 = s.post(f"{BASE_URL}/api/history", json={"source_url": src, "title": "Sample2"})
    assert r3.status_code == 200
    r4 = s.get(f"{BASE_URL}/api/history")
    entries = [e for e in r4.json() if e["source_url"] == src]
    assert len(entries) == 1, "Should dedupe by source_url"
    assert entries[0]["played_at"] >= first_played
    assert entries[0]["title"] == "Sample2"

    rd = s.delete(f"{BASE_URL}/api/history")
    assert rd.status_code == 200
    r5 = s.get(f"{BASE_URL}/api/history")
    assert r5.json() == []


# -----------------------
# Favorites
# -----------------------
def test_favorites_crud_and_dup(registered_client):
    s, _ = registered_client
    src = "https://terabox.com/s/1favtest"
    r1 = s.post(f"{BASE_URL}/api/favorites", json={"source_url": src, "title": "F"})
    assert r1.status_code == 200
    r2 = s.get(f"{BASE_URL}/api/favorites")
    assert any(e["source_url"] == src for e in r2.json())

    r3 = s.post(f"{BASE_URL}/api/favorites", json={"source_url": src, "title": "F"})
    assert r3.status_code == 400
    assert "already in favorites" in r3.json()["detail"].lower()

    r4 = s.delete(f"{BASE_URL}/api/favorites", params={"source_url": src})
    assert r4.status_code == 200
    r5 = s.get(f"{BASE_URL}/api/favorites")
    assert not any(e["source_url"] == src for e in r5.json())


# -----------------------
# Continue-Watching
# -----------------------
def test_continue_watching_upsert_and_delete(registered_client):
    s, _ = registered_client
    src = "https://terabox.com/s/1cwtest"
    r1 = s.post(f"{BASE_URL}/api/continue-watching",
                json={"source_url": src, "position_seconds": 30, "duration_seconds": 120,
                      "title": "CW"})
    assert r1.status_code == 200
    body = r1.json()
    assert body["ok"] is True
    assert body.get("removed") is not True

    r2 = s.get(f"{BASE_URL}/api/continue-watching")
    assert r2.status_code == 200
    items = r2.json()
    assert any(i["source_url"] == src and i["position_seconds"] == 30 for i in items)

    # Update position
    r3 = s.post(f"{BASE_URL}/api/continue-watching",
                json={"source_url": src, "position_seconds": 60, "duration_seconds": 120})
    assert r3.status_code == 200
    r4 = s.get(f"{BASE_URL}/api/continue-watching")
    same = [i for i in r4.json() if i["source_url"] == src]
    assert len(same) == 1 and same[0]["position_seconds"] == 60

    # Fully-watched -> auto-remove
    r5 = s.post(f"{BASE_URL}/api/continue-watching",
                json={"source_url": src, "position_seconds": 118, "duration_seconds": 120})
    assert r5.status_code == 200
    assert r5.json().get("removed") is True
    r6 = s.get(f"{BASE_URL}/api/continue-watching")
    assert not any(i["source_url"] == src for i in r6.json())

    # DELETE all
    s.post(f"{BASE_URL}/api/continue-watching",
           json={"source_url": src, "position_seconds": 10, "duration_seconds": 120})
    r7 = s.delete(f"{BASE_URL}/api/continue-watching")
    assert r7.status_code == 200
    assert s.get(f"{BASE_URL}/api/continue-watching").json() == []


# -----------------------
# Google session invalid
# -----------------------
def test_google_session_invalid(api_client):
    r = api_client.post(f"{BASE_URL}/api/auth/google/session",
                        json={"session_id": "totally-fake-session-xyz"})
    assert r.status_code == 401, f"Got {r.status_code}: {r.text}"
    assert "invalid or expired" in r.json()["detail"].lower()


# -----------------------
# Subscription (mock)
# -----------------------
def test_subscribe_create_order_mock(registered_client):
    s, _ = registered_client
    r = s.post(f"{BASE_URL}/api/subscribe/create-order", json={"plan": "pro_monthly"})
    assert r.status_code == 200
    body = r.json()
    assert body["mode"] == "mock"
    assert body["order_id"].startswith("mock_order_")
    assert body["amount"] == 4900


def test_subscribe_mock_upgrade_and_status_and_quota(registered_client, api_client):
    s, _ = registered_client
    r = s.post(f"{BASE_URL}/api/subscribe/mock", json={"plan": "pro_monthly"})
    assert r.status_code == 200
    assert r.json()["user"]["subscription_status"] == "pro"

    st = s.get(f"{BASE_URL}/api/subscribe/status")
    assert st.status_code == 200
    assert st.json()["status"] == "pro"

    # Now /api/quota should reflect is_pro=true limit=-1 for this user
    q = s.get(f"{BASE_URL}/api/quota")
    assert q.status_code == 200
    qd = q.json()
    assert qd["is_pro"] is True
    assert qd["limit"] == -1


def test_subscribe_verify_blocked_in_mock(registered_client):
    s, _ = registered_client
    r = s.post(f"{BASE_URL}/api/subscribe/verify",
               json={"razorpay_order_id": "x", "razorpay_payment_id": "y", "razorpay_signature": "z"})
    assert r.status_code == 400
    assert "razorpay live mode is not configured" in r.json()["detail"].lower()


# -----------------------
# Webhook invalid signature
# -----------------------
def test_webhook_invalid_signature(api_client):
    r = api_client.post(
        f"{BASE_URL}/api/webhook/razorpay",
        data=b'{"event":"payment.captured"}',
        headers={"Content-Type": "application/json", "X-Razorpay-Signature": "not-a-valid-signature"},
    )
    # Either 400 for invalid signature, or 400 if secret not configured. Both are 400.
    assert r.status_code == 400
    detail = r.json()["detail"].lower()
    assert ("invalid webhook signature" in detail) or ("webhook secret not configured" in detail)
