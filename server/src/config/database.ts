import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
export function createDatabase(url: string) {
 return new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 10, connectionTimeoutMillis: 5000 }, { schema: new URL(url).searchParams.get("schema") ?? "public" }) });
}
export type Database = ReturnType<typeof createDatabase>;
