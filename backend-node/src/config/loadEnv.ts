import dotenv from "dotenv";
import "../db/pgTypes.js";

// Must be imported (for its side effect) before anything that calls
// getSettings() - every entrypoint (server.ts, mcp/server.ts, every
// script in src/scripts/) imports this first, mirroring how the Python
// backend's pydantic-settings reads .env automatically. Also installs
// the DATE type-parser fix (db/pgTypes.ts) before any Pool is created.
dotenv.config();
