import { competitiveRouter } from "./routes/competitive.js";
import express from "express";
import cors from "cors";
import type { Environment } from "./config/env.js";
import { healthRouter } from "./routes/health.js";
import type { AuthService } from "./services/auth.js";
import { authRouter } from "./routes/auth.js";
import { profileRouter } from "./routes/profile.js";
import { requireTrustedMutation } from "./middleware/auth.js";
import { errorHandler } from "./middleware/error-handler.js";
import { matchesRouter } from "./routes/matches.js";
import type { MatchService } from "./services/matches.js";
export function createApp(config: Environment, auth: AuthService, redisStatus: () => string = () => "disabled", matches?: MatchService) {
 const app = express();
 app.disable("x-powered-by");
 app.set("trust proxy", config.trustProxyHops);
 app.use(cors({ origin: config.frontendUrl, credentials: true, allowedHeaders: ["Content-Type", "X-Arena-Request"] }));
 app.use("/api", (_request, response, next) => { response.set("Cache-Control", "no-store"); response.set("X-Content-Type-Options", "nosniff"); next(); });
 app.use("/api", requireTrustedMutation(config));
 app.use(express.json({ limit: "16kb" }));
 app.use("/api", healthRouter(config, redisStatus));
 app.use("/api/auth", authRouter(config, auth));
 if (matches) app.use("/api", competitiveRouter(config,auth,matches));
 if (matches) app.use("/api/matches", matchesRouter(config,auth,matches));
 app.use("/api/profile", profileRouter(config, auth));
 app.use((_request, response) => { response.status(404).json({ error: "Not found" }); });
 app.use(errorHandler);
 return app;
}
