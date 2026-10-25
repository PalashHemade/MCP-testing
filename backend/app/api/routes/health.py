from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@router.get("/api/v1/health/ready")
async def readiness(session: AsyncSession = Depends(get_db)) -> dict:
    try:
        await session.execute(text("SELECT 1"))
        db_ok = True
    except Exception as exc:  # noqa: BLE001
        return {"status": "not_ready", "database": f"unreachable: {exc}"}
    return {"status": "ok", "database": "ok" if db_ok else "unreachable"}
