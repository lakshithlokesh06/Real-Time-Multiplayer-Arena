import type { ErrorRequestHandler } from "express";
import { logger } from "../utils/logger.js";
export const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, next) => {
 if (response.headersSent) { next(error); return; }
 const status = typeof error === "object" && error !== null && "status" in error && typeof error.status === "number" && error.status >= 400 && error.status < 500 ? error.status : 500;
 logger.error("request.failed", { status });
 response.status(status).json({ error: status === 500 ? "Internal server error" : "Invalid request" });
};
