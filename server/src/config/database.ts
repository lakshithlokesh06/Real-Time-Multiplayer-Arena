import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
export function createDatabase(url: string) {
 // Prisma qualifies model queries; raw ranking/locking SQL also needs the same schema.
 const schema=new URL(url).searchParams.get("schema") ?? "public";
 if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema))throw new Error("Invalid database schema name");
 return new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 10, connectionTimeoutMillis: 5000, options: `-c search_path=${schema}` }, { schema }) });
}
export type Database = ReturnType<typeof createDatabase>;
