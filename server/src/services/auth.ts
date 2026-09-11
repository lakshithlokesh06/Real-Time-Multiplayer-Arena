import { createHash, randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import argon2 from "argon2";
import type { Database } from "../config/database.js";
import type { Environment } from "../config/env.js";
import { Prisma } from "../generated/prisma/client.js";
import { HttpError } from "../utils/http-error.js";
import { registerSchema, loginSchema, profileSchema, validate } from "./validation.js";

const passwordOptions = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;
const dummyPasswordHash = argon2.hash(randomBytes(32), passwordOptions);
const playerSelect = { id: true, email: true, createdAt: true, profile: { select: { id: true, username: true, displayName: true, rating: true } } } satisfies Prisma.UserSelect;
type PlayerRecord = Prisma.UserGetPayload<{ select: typeof playerSelect }>;
function safePlayer(user: PlayerRecord) {
 if (!user.profile) throw new HttpError(401, "Authentication required.");
 return { id: user.id, email: user.email, createdAt: user.createdAt.toISOString(), profile: user.profile };
}
export type Player = ReturnType<typeof safePlayer>;
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export function createAuthService(db: Database, config: Environment) {
 const events = new EventEmitter();
 async function issueSession(userId: string, oldToken?: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + config.sessionTtl * 1000);
  const old = oldToken ? await db.session.findUnique({ where: { tokenHash: hashToken(oldToken) }, select: { id: true } }) : null;
  await db.$transaction(async tx => {
   if (old) await tx.session.deleteMany({ where: { id: old.id } });
   await tx.session.create({ data: { userId, tokenHash: hashToken(token), expiresAt } });
  });
  if (old) events.emit("revoked", old.id);
  return { token, expiresAt };
 }
 async function resolve(token?: string) {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const session = await db.session.findUnique({ where: { tokenHash: hashToken(token) }, select: { id: true, expiresAt: true, user: { select: playerSelect } } });
  if (!session || session.expiresAt.getTime() <= Date.now()) return null;
  return { sessionId: session.id, expiresAt: session.expiresAt, player: safePlayer(session.user) };
 }
 return {
  resolve,
  async register(input: unknown, oldToken?: string) {
   const data = validate(registerSchema, input);
   const passwordHash = await argon2.hash(data.password, passwordOptions);
   // User, profile, and initial session commit together, including uniqueness checks.
   const token = randomBytes(32).toString("base64url");
   const expiresAt = new Date(Date.now() + config.sessionTtl * 1000);
   const old = oldToken ? await db.session.findUnique({ where: { tokenHash: hashToken(oldToken) }, select: { id: true } }) : null;
   try {
    const user = await db.$transaction(async tx => {
     const user = await tx.user.create({ data: { email: data.email, passwordHash, profile: { create: { username: data.username, displayName: data.displayName } }, sessions: { create: { tokenHash: hashToken(token), expiresAt } } }, select: playerSelect });
     if (old) await tx.session.deleteMany({ where: { id: old.id } });
     return user;
    });
    if (old) events.emit("revoked", old.id);
    return { player: safePlayer(user), token, expiresAt };
   } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new HttpError(409, "Unable to create an account with those details. Try another username or sign in.");
    throw error;
   }
  },
  async login(input: unknown, oldToken?: string) {
   const data = validate(loginSchema, input);
   const user = await db.user.findUnique({ where: { email: data.email }, select: { ...playerSelect, passwordHash: true } });
   const matches = await argon2.verify(user?.passwordHash ?? await dummyPasswordHash, data.password);
   if (!user || !matches) throw new HttpError(401, "Invalid email or password.");
   return { player: safePlayer(user), ...await issueSession(user.id, oldToken) };
  },
  async revoke(token?: string) {
   if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return;
   const session = await db.session.findUnique({ where: { tokenHash: hashToken(token) }, select: { id: true } });
   if (session) { await db.session.deleteMany({ where: { id: session.id } }); events.emit("revoked", session.id); }
  },
  async updateProfile(userId: string, input: unknown) {
   const data = validate(profileSchema, input);
   await db.playerProfile.update({ where: { userId }, data });
   const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: playerSelect });
   return safePlayer(user);
  },
  async sessionActive(sessionId: string) {
   return Boolean(await db.session.findFirst({ where: { id: sessionId, expiresAt: { gt: new Date() } }, select: { id: true } }));
  },
  onRevoked(listener: (id: string) => void) { events.on("revoked", listener); return () => { events.off("revoked", listener); }; },
  cleanupExpired() { return db.session.deleteMany({ where: { expiresAt: { lte: new Date() } } }); },
 };
}
export type AuthService = ReturnType<typeof createAuthService>;
export type AuthIdentity = NonNullable<Awaited<ReturnType<AuthService["resolve"]>>>;
