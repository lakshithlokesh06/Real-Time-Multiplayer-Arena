import express from "express";
import cors from "cors";
import type { Environment } from "./config/env.js";
import { healthRouter } from "./routes/health.js";
import { errorHandler } from "./middleware/error-handler.js";
export function createApp(config: Environment, redisStatus: () => string = () => "disabled") {
 const app = express();
 app.disable("x-powered-by");
 app.use(cors({ origin: config.frontendUrl }));
 app.use(express.json({ limit: "16kb" }));
 app.use("/api", healthRouter(config, redisStatus));
 app.use((_request, response) => { response.status(404).json({ error: "Not found" }); });
 app.use(errorHandler);
 return app;
}
