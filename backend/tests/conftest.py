import os
import time
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv

# Load frontend .env for REACT_APP_BACKEND_URL
load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")


@pytest.fixture(scope="session")
def base_url() -> str:
    return BASE_URL


@pytest.fixture
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture
def fresh_email():
    return f"linkplay-test-{int(time.time()*1000)}@example.com"


@pytest.fixture
def registered_client(api_client, fresh_email):
    """Returns (session, email) with signed-in cookies for a fresh user."""
    r = api_client.post(f"{BASE_URL}/api/auth/register",
                        json={"email": fresh_email, "password": "password123", "name": "Tester"})
    assert r.status_code == 200, r.text
    return api_client, fresh_email


@pytest.fixture(scope="session", autouse=True)
def reset_rate_limits_for_ip():
    """Clear rate_limits so IP-based tests start clean. Best-effort local mongo."""
    try:
        import pymongo
        c = pymongo.MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"),
                                serverSelectionTimeoutMS=1500)
        c[os.environ.get("DB_NAME", "test_database")]["rate_limits"].delete_many({})
    except Exception:
        pass
    yield
