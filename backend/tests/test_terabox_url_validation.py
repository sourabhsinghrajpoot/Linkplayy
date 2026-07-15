"""
LinkPlay - Terabox URL validation matrix tests (iteration 6)

Verifies the expanded TERABOX_HOSTS list AND the lenient urlparse-based
fallback for is_valid_terabox_url().

Rules under test (from review request):
  1. New whitelisted mirror hosts (terashare.co, teraboxshare.com,
     terafileshare.com, teraboxlink.com, tibibox.com) must PASS validation
     -> POST /api/terabox/extract returns 422 (upstream extraction fails
     on fake URL, expected) NOT 400 (validation rejection).
  2. Previously-whitelisted URLs (terabox.com, terasharelink.com,
     4funbox.com) still pass validation -> 422 on fake URL.
  3. Non-terabox URLs (example.com, youtube.com, google.com) return 400
     "Not a valid Terabox link".
  4. Lenient fallback: host containing "tera" is accepted (extractor will
     still reject with 422 on unknown fake link). Path/query 'tera' is
     NOT enough (only hostname).
"""

import os
import pymongo
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")


@pytest.fixture
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _reset_rate_limits():
    try:
        c = pymongo.MongoClient(
            os.environ.get("MONGO_URL", "mongodb://localhost:27017"),
            serverSelectionTimeoutMS=1500,
        )
        c[os.environ.get("DB_NAME", "test_database")]["rate_limits"].delete_many({})
    except Exception:
        pass


def _extract(api_client, url, xff=None):
    _reset_rate_limits()
    headers = {"X-Forwarded-For": xff} if xff else {}
    return api_client.post(
        f"{BASE_URL}/api/terabox/extract",
        json={"url": url},
        headers=headers,
    )


# ----------------------------------------------------------
# NEW mirror domains must PASS validation (return 422/502, not 400)
# ----------------------------------------------------------
@pytest.mark.parametrize("url,ip", [
    ("https://terashare.co/s/1abcfake",           "198.51.100.11"),
    ("https://teraboxshare.com/s/1abcfake",       "198.51.100.12"),
    ("https://terafileshare.com/s/1abcfake",      "198.51.100.13"),
    ("https://teraboxlink.com/s/1abcfake",        "198.51.100.14"),
    ("https://tibibox.com/s/1abcfake",            "198.51.100.15"),
    ("https://terafileshareonline.com/s/1abcfake","198.51.100.16"),
    ("https://terabox.fun/s/1abcfake",            "198.51.100.17"),
    ("https://gibibox.com/s/1abcfake",            "198.51.100.18"),
    ("https://goaibox.com/s/1abcfake",            "198.51.100.19"),
    ("https://terabox.online/s/1abcfake",         "198.51.100.20"),
    ("https://teraboxapp.pro/s/1abcfake",         "198.51.100.21"),
    ("https://terafileshare.co/s/1abcfake",       "198.51.100.22"),
])
def test_new_mirror_hosts_pass_validation(api_client, url, ip):
    r = _extract(api_client, url, xff=ip)
    assert r.status_code in (422, 502), (
        f"Expected 422/502 (validation passed, upstream failed) for {url}, "
        f"got {r.status_code}: {r.text}"
    )
    # Ensure it's NOT the validation-rejection message
    assert "not a valid terabox" not in r.text.lower(), (
        f"URL {url} was WRONGLY rejected by validation: {r.text}"
    )


# ----------------------------------------------------------
# Previously-whitelisted hosts still pass
# ----------------------------------------------------------
@pytest.mark.parametrize("url,ip", [
    ("https://terabox.com/s/1abcfake",         "198.51.100.31"),
    ("https://terasharelink.com/s/1abcfake",   "198.51.100.32"),
    ("https://4funbox.com/s/1abcfake",         "198.51.100.33"),
    ("https://1024terabox.com/s/1abcfake",     "198.51.100.34"),
    ("https://freeterabox.com/s/1abcfake",     "198.51.100.35"),
])
def test_whitelisted_hosts_still_pass_validation(api_client, url, ip):
    r = _extract(api_client, url, xff=ip)
    assert r.status_code in (422, 502), (
        f"Regression: {url} should still pass validation. "
        f"Got {r.status_code}: {r.text}"
    )
    assert "not a valid terabox" not in r.text.lower()


# ----------------------------------------------------------
# Non-terabox URLs must be REJECTED with 400
# ----------------------------------------------------------
@pytest.mark.parametrize("url,ip", [
    ("https://example.com/s/1abc",           "198.51.100.41"),
    ("https://youtube.com/watch?v=x",        "198.51.100.42"),
    ("https://google.com",                   "198.51.100.43"),
    ("https://github.com/foo/bar",           "198.51.100.44"),
    ("https://drive.google.com/file/d/xyz",  "198.51.100.45"),
    # 'tera' appears only in the PATH, not the host -> must be rejected
    ("https://foo.com/tera/file",            "198.51.100.46"),
    # host contains '1024' but not 'box' -> must be rejected
    ("https://foo1024.com/s/1",              "198.51.100.47"),
])
def test_non_terabox_urls_rejected(api_client, url, ip):
    r = _extract(api_client, url, xff=ip)
    assert r.status_code == 400, (
        f"Expected 400 rejection for {url}, got {r.status_code}: {r.text}"
    )
    assert "not a valid terabox" in r.json()["detail"].lower()


# ----------------------------------------------------------
# Lenient host-based fallback: 'tera' in host but not a mirror -> accepted
# (extractor will 422 anyway; that's the accepted false-positive scope)
# ----------------------------------------------------------
@pytest.mark.parametrize("url,ip", [
    ("https://terapin.com/s/1abcfake",    "198.51.100.51"),
    ("https://iterate.com/foo",           "198.51.100.52"),  # 'tera' in 'iterate'
])
def test_lenient_fallback_accepts_tera_in_host(api_client, url, ip):
    r = _extract(api_client, url, xff=ip)
    # Not rejected as invalid host -> proceeds to extractor -> upstream fails
    assert r.status_code in (422, 502), (
        f"Lenient fallback should accept {url}. Got {r.status_code}: {r.text}"
    )
    assert "not a valid terabox" not in r.text.lower()


# ----------------------------------------------------------
# Non-string / empty payloads
# ----------------------------------------------------------
def test_empty_url_rejected(api_client):
    _reset_rate_limits()
    r = api_client.post(f"{BASE_URL}/api/terabox/extract", json={"url": ""})
    # FastAPI/Pydantic may return 422 for empty required field, or 400 from
    # our validator. Either is acceptable — must NOT be 200/500.
    assert r.status_code in (400, 422), r.text
