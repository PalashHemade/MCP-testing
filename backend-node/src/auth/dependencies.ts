import type { NextFunction, Request, Response } from "express";
import { getSettings } from "../config/settings.js";
import { resolveDevUser } from "./devAuth.js";
import type { AuthenticatedUser } from "./models.js";

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthenticatedUser;
  }
}

/** Resolves req.user from the X-Demo-User header (AUTH_MODE=dev) or
 * fails loudly (AUTH_MODE=oidc is a documented, unimplemented stub) -
 * mirrors app.auth.dependencies.get_current_user in the Python backend.
 */
export function requireUser(req: Request, res: Response, next: NextFunction): void {
  const settings = getSettings();

  if (settings.isProduction && settings.authMode === "dev") {
    res.status(500).json({ detail: "AUTH_MODE=dev must not be used with APP_ENV=production" });
    return;
  }

  if (settings.authMode === "dev") {
    const headerValue = req.header("X-Demo-User");
    const user = resolveDevUser(headerValue);
    if (!user) {
      res.status(401).json({ detail: `Unknown X-Demo-User '${headerValue}'` });
      return;
    }
    req.user = user;
    next();
    return;
  }

  res.status(501).json({
    detail:
      "AUTH_MODE=oidc is not implemented in this demo - configure a real OIDC/JWT identity " +
      "provider and replace src/auth/dependencies.ts before using this mode.",
  });
}
