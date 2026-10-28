import { randomUUID } from "node:crypto";
import cors from "cors";
import express, { type ErrorRequestHandler, type NextFunction, type Request, type Response } from "express";
import { getSettings } from "./config/settings.js";
import type { KnowledgeBundle } from "./knowledge/types.js";
import { createChatRouter } from "./api/routes/chat.js";
import { healthRouter } from "./api/routes/health.js";
import { toolsRouter } from "./api/routes/tools.js";

declare module "express-serve-static-core" {
  interface Request {
    requestId?: string;
  }
}

export function createApp(knowledgeBundle: KnowledgeBundle): express.Express {
  const settings = getSettings();
  const app = express();

  app.use(
    cors({
      origin: settings.frontendOrigin,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "256kb" }));

  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = (req.header("X-Request-ID") as string | undefined) ?? randomUUID();
    req.requestId = requestId;
    res.setHeader("X-Request-ID", requestId);
    next();
  });

  app.use(healthRouter);
  app.use(createChatRouter(knowledgeBundle));
  app.use(toolsRouter);

  // Never expose raw exception internals / stack traces / connection
  // strings to the client - logged server-side with the request id,
  // generic message returned. A connection-refused/timed-out/cannot-
  // connect-now error from the `pg` driver means the database (or
  // network path to it) is down or overloaded, not that the request was
  // malformed or the server is broken - that is a 503, not a 500, so
  // clients know it's safe and sensible to retry.
  const TRANSIENT_CONNECTION_CODES = new Set(["ECONNREFUSED", "ETIMEDOUT", "EHOSTUNREACH", "57P03"]);
  const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
    console.error(`[unhandled_error] requestId=${req.requestId}`, err);
    const code = err && typeof err === "object" ? (err as { code?: unknown }).code : undefined;
    if (typeof code === "string" && TRANSIENT_CONNECTION_CODES.has(code)) {
      res.status(503).json({ detail: "The service is temporarily unavailable. Please try again shortly.", requestId: req.requestId });
      return;
    }
    res.status(500).json({ detail: "An internal error occurred.", requestId: req.requestId });
  };
  app.use(errorHandler);

  return app;
}
