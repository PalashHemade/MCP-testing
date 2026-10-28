import type { NextFunction, Request, Response } from "express";
import type { PoolClient } from "pg";
import { getPool } from "../../db/pool.js";

declare module "express-serve-static-core" {
  interface Request {
    dbClient?: PoolClient;
  }
}

/** Checks out a client scoped to this request's tenant/customer (RLS
 * session variables set, checked by the policies on trips/trip_billing/
 * trip_expenses) and releases it when the response finishes - the Node
 * equivalent of app.auth.dependencies.get_scoped_db in the Python
 * sibling backend. Must run AFTER requireUser (needs req.user set).
 */
export async function withScopedClient(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    res.status(500).json({ detail: "withScopedClient used before requireUser" });
    return;
  }

  // Checking out a connection is where a down/overloaded Postgres shows
  // up first (ECONNREFUSED, pool exhaustion, etc). That is a transient,
  // retryable condition from the caller's point of view, so it gets a
  // 503 with a safe generic message - never the raw driver error, which
  // can include connection strings or internal detail.
  let client;
  try {
    client = await getPool().connect();
  } catch (err) {
    console.error(`[db_connect_failed] requestId=${req.requestId}`, err);
    res.status(503).json({ detail: "The database is temporarily unavailable. Please try again shortly.", requestId: req.requestId });
    return;
  }

  try {
    await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [req.user.tenantId]);
    await client.query("SELECT set_config('app.current_customer_id', $1, false)", [req.user.customerId ?? ""]);
  } catch (err) {
    console.error(`[db_scope_failed] requestId=${req.requestId}`, err);
    client.release();
    res.status(503).json({ detail: "Failed to prepare the database session. Please try again shortly.", requestId: req.requestId });
    return;
  }

  req.dbClient = client;
  res.on("finish", () => client.release());
  next();
}
