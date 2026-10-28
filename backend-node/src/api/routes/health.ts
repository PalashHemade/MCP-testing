import { Router } from "express";
import { getPool } from "../../db/pool.js";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

healthRouter.get("/api/v1/health/ready", async (_req, res) => {
  try {
    await getPool().query("SELECT 1");
    res.json({ status: "ok", database: "ok" });
  } catch (err) {
    // 503, not 200 - this is a readiness probe; infra (load balancers,
    // orchestrators) needs a non-2xx status to actually stop routing
    // traffic here. The raw driver error is logged server-side only -
    // it can include connection details that shouldn't reach a client.
    console.error("[readiness_check_failed]", err);
    res.status(503).json({ status: "not_ready", database: "unreachable" });
  }
});
