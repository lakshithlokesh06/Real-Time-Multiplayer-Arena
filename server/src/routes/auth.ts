import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import type { Environment } from "../config/env.js";
import type { AuthService } from "../services/auth.js";
import { readSessionCookie, requireAuth, identity, sessionCookie } from "../middleware/auth.js";
export function authRouter(config: Environment, auth: AuthService) {
 const router = Router();
 const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Too many attempts. Please try again in 15 minutes." } });
 router.post("/register", limiter, async (request, response) => {
  const result = await auth.register(request.body, readSessionCookie(request.headers.cookie, config));
  sessionCookie(response, config, result);
  response.status(201).json({ player: result.player });
 });
 router.post("/login", limiter, async (request, response) => {
  const result = await auth.login(request.body, readSessionCookie(request.headers.cookie, config));
  sessionCookie(response, config, result);
  response.json({ player: result.player });
 });
 router.get("/me", requireAuth(auth, config), (_request, response) => response.json({ player: identity(response).player }));
 router.post("/logout", async (request, response) => {
  await auth.revoke(readSessionCookie(request.headers.cookie, config));
  sessionCookie(response, config);
  response.status(204).end();
 });
 return router;
}
