"""Standalone MCP server exposing the 10 registered logistics tools over
Streamable HTTP, for external MCP clients (e.g. an MCP-aware desktop
assistant) to call directly.

This process shares the exact same app.mcp.registry.TOOL_REGISTRY /
app.services.* implementations as the FastAPI orchestrator - there is
only one implementation of each tool's logic, never two.

IMPORTANT (documented simplification): a real deployment would
authenticate each MCP connection (e.g. mTLS or an OAuth-protected
Streamable HTTP endpoint) and resolve tenant scope per-connection. This
demo binds the standalone MCP server to a single fixed demo identity
(DEMO_MCP_USER_KEY, default "demo-ops-primary") because the MCP SDK's
server-side auth hooks are out of scope for this exercise. The FastAPI
chat/orchestrator path (app.orchestrator.pipeline) is the one that
carries real per-request authentication via app.auth.dependencies and
should be treated as the authoritative access path; do not expose this
standalone server to the public internet.
"""
import os

from mcp.server.fastmcp import FastMCP

from app.auth.dev_auth import DEV_USERS, resolve_dev_user
from app.config import get_settings
from app.db.session import session_scope
from app.mcp.registry import TOOL_SPECS

settings = get_settings()
mcp = FastMCP("logistics-tools")

_demo_user_key = os.environ.get("DEMO_MCP_USER_KEY", "demo-ops-primary")
_demo_user = resolve_dev_user(_demo_user_key)
if _demo_user is None:
    raise RuntimeError(f"DEMO_MCP_USER_KEY '{_demo_user_key}' is not a known demo user: {list(DEV_USERS)}")


def _register(spec):
    async def tool_fn(input_data: spec.input_model) -> dict:  # type: ignore[name-defined]
        async with session_scope() as session:
            output = await spec.run(session, _demo_user, input_data)
            return output.model_dump(mode="json")

    tool_fn.__name__ = spec.name
    tool_fn.__doc__ = spec.description
    mcp.tool(name=spec.name, description=spec.description)(tool_fn)


for _spec in TOOL_SPECS:
    _register(_spec)


if __name__ == "__main__":
    mcp.settings.host = settings.mcp_server_host
    mcp.settings.port = settings.mcp_server_port
    mcp.run(transport="streamable-http")
