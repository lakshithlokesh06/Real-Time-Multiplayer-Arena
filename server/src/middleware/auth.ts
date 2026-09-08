import type { Request, RequestHandler, Response } from "express";
import { parse } from "cookie";
import type { Environment } from "../config/env.js";
import type { AuthService, AuthIdentity } from "../services/auth.js";
import { HttpError } from "../utils/http-error.js";
export function readSessionCookie(header: string | undefined, config: Environment) {
 if (!header) return undefined;
 try { return parse(header)[config.sessionCookieName]; } catch { return undefined; }
}
export function sessionCookie(response: Response, config: Environment, session?: { token: string; expiresAt: Date }) {
 const options = { httpOnly: true, secure: config.cookieSecure, sameSite: config.cookieSameSite, path: "/" };
 if (session) response.cookie(config.sessionCookieName, session.token, { ...options, expires: session.expiresAt, maxAge: config.sessionTtl * 1000 });
 else response.clearCookie(config.sessionCookieName, options);
}
export function requireAuth(auth: AuthService, config: Environment): RequestHandler {
 return async (request, response, next) => {
  const identity = await auth.resolve(readSessionCookie(request.headers.cookie, config));
  if (!identity) throw new HttpError(401, "Authentication required.");
  response.locals.identity = identity;
  next();
 };
}
export function identity(response: Response): AuthIdentity { return response.locals.identity as AuthIdentity; }
export const requireTrustedMutation = (config: Environment): RequestHandler => (request: Request, _response, next) => {
 if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
  if (request.headers.origin !== config.frontendUrl || request.headers["x-arena-request"] !== "1") throw new HttpError(403, "Request origin is not allowed.");
  if (!request.is("application/json")) throw new HttpError(415, "Use application/json.");
 }
 next();
};
