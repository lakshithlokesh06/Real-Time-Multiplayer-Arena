export const logger = {
 info: (event: string, details: Record<string, unknown> = {}) => console.log(JSON.stringify({ level: "info", event, ...details, timestamp: new Date().toISOString() })),
 warn: (event: string, details: Record<string, unknown> = {}) => console.warn(JSON.stringify({ level: "warn", event, ...details, timestamp: new Date().toISOString() })),
 error: (event: string, details: Record<string, unknown> = {}) => console.error(JSON.stringify({ level: "error", event, ...details, timestamp: new Date().toISOString() })),
};
