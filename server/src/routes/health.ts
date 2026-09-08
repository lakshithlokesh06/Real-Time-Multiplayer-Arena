import { Router } from "express";
import type { Environment } from "../config/env.js";
export function healthRouter(config: Environment, redisStatus: () => string) {
 const router = Router();
 router.get("/health", (_request, response) => response.json({ service: "arena-game-server", status: "ok", environment: config.environment, version: "0.1.0", timestamp: new Date().toISOString(), dependencies: { database: "not-initialized", redis: redisStatus() } }));
 return router;
}
