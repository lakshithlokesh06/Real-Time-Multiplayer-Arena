import "dotenv/config";
export function parseEnv(source: NodeJS.ProcessEnv) {
 const environment = source.NODE_ENV ?? "development";
 if (!["development", "test", "production"].includes(environment)) throw new Error("NODE_ENV must be development, test, or production");
 const port = Number(source.PORT ?? 4000);
 if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be an integer between 1 and 65535");
 const frontendUrl = source.FRONTEND_URL ?? (environment === "production" ? "" : "http://localhost:3000");
 const origin = new URL(frontendUrl);
 if (!["http:", "https:"].includes(origin.protocol) || origin.origin !== frontendUrl) throw new Error("FRONTEND_URL must be an HTTP(S) origin with no trailing slash");
 const redisUrl = source.REDIS_URL || undefined;
 if (redisUrl && !["redis:", "rediss:"].includes(new URL(redisUrl).protocol)) throw new Error("REDIS_URL must use redis:// or rediss://");
 const databaseUrl = source.DATABASE_URL || undefined;
 if (databaseUrl && !["postgres:", "postgresql:"].includes(new URL(databaseUrl).protocol)) throw new Error("DATABASE_URL must use PostgreSQL");
 return { environment, port, frontendUrl, redisUrl, databaseUrl };
}
export type Environment = ReturnType<typeof parseEnv>;
export const env = parseEnv(process.env);
