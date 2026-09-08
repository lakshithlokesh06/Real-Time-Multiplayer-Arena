import { clientConfig } from "@/lib/config";
export class ApiError extends Error {
 constructor(public readonly status: number, message: string) { super(message); }
}
export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
 let response: Response;
 try {
  response = await fetch(`${clientConfig.apiUrl}${path}`, { method: options.method ?? "GET", credentials: "include", cache: "no-store", headers: { "Content-Type": "application/json", "X-Arena-Request": "1" }, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
 } catch { throw new ApiError(0, "Cannot reach the server. Please try again."); }
 if (!response.ok) {
  const data: unknown = await response.json().catch(() => null);
  const message = data && typeof data === "object" && "error" in data && typeof data.error === "string" ? data.error : "Something went wrong. Please try again.";
  if (response.status === 401 && !["/api/auth/login", "/api/auth/me"].includes(path)) window.dispatchEvent(new Event("arena:unauthorized"));
  throw new ApiError(response.status, response.status >= 500 ? "The server is temporarily unavailable. Please try again." : message);
 }
 return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}
