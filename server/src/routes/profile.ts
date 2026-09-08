import { Router } from "express";
import type { Environment } from "../config/env.js";
import type { AuthService } from "../services/auth.js";
import { requireAuth, identity } from "../middleware/auth.js";
export function profileRouter(config: Environment, auth: AuthService) {
 const router = Router();
 router.use(requireAuth(auth, config));
 router.patch("/", async (request, response) => response.json({ player: await auth.updateProfile(identity(response).player.id, request.body) }));
 return router;
}
