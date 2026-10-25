import pytest
from httpx import ASGITransport, AsyncClient

from app.db.session import get_db
from app.main import app


@pytest.fixture
def override_db(db_session):
    async def _get_db():
        yield db_session

    app.dependency_overrides[get_db] = _get_db
    yield
    app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_health_endpoint():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_readiness_endpoint(override_db):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/health/ready")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_chat_requires_authentication():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/v1/chat", json={"message": "hi"}, headers={"X-Demo-User": "not-a-real-user"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_chat_happy_path(override_db):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/api/v1/chat",
            json={"message": "Show me the details of TRIP-1001."},
            headers={"X-Demo-User": "demo-ops-primary"},
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["tool_executions"][0]["tool_name"] == "get_trip_details"
    assert body["tool_executions"][0]["status"] == "success"


@pytest.mark.asyncio
async def test_list_tools_returns_all_ten(override_db):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/tools", headers={"X-Demo-User": "demo-ops-primary"})
    assert resp.status_code == 200
    assert len(resp.json()) == 10


@pytest.mark.asyncio
async def test_execute_tool_endpoint_validates_arguments(override_db):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/api/v1/tools/list_trips/execute", json={"limit": 999999},
            headers={"X-Demo-User": "demo-ops-primary"},
        )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_execute_unknown_tool_returns_404(override_db):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/api/v1/tools/delete_everything/execute", json={}, headers={"X-Demo-User": "demo-ops-primary"},
        )
    assert resp.status_code == 404
