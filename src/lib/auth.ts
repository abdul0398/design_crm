import { cookies } from "next/headers";
import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
  createHmac,
} from "node:crypto";
import { promisify } from "node:util";
import { rows, db } from "./db";
import { fail } from "./http";
const scrypt = promisify(scryptCallback);
export const cookieName = process.env.APP_ORIGIN?.startsWith("https:")
  ? "__Host-launch_session"
  : "launch_session";
export function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32)
    throw new Error("SESSION_SECRET must contain at least 32 characters");
  return value;
}
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}
export async function checkPassword(password: string, stored: string) {
  const [salt, hex] = stored.split(":");
  const expected = Buffer.from(hex, "hex");
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export async function currentUser() {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;
  const users = await rows<{
    id: string;
    email: string;
    username: string | null;
  }>(
    "SELECT u.id,u.email,u.username FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>UTC_TIMESTAMP(3)",
    [hash(token)],
  );
  return users[0] || null;
}
export async function requireUser(req?: Request) {
  if (req) {
    assertAppHost(req);
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) assertOrigin(req);
  }
  const user = await currentUser();
  if (!user) fail(401, "Please sign in");
  return user;
}
export function assertAppHost(req: Request) {
  if (req.headers.get("host") !== new URL(process.env.APP_ORIGIN!).host)
    fail(403, "Invalid workspace host");
}
export function assertOrigin(req: Request) {
  if (req.headers.get("origin") !== process.env.APP_ORIGIN)
    fail(403, "Invalid request origin");
}
export async function newSession(userId: string) {
  secret();
  const token = randomBytes(32).toString("hex");
  await db().execute("DELETE FROM sessions WHERE expires_at<UTC_TIMESTAMP()");
  await db().execute(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 7 DAY))",
    [hash(token), userId],
  );
  (await cookies()).set(cookieName, token, {
    httpOnly: true,
    secure: process.env.APP_ORIGIN?.startsWith("https:"),
    sameSite: "strict",
    path: "/",
    maxAge: 604800,
  });
}
export function signPreview(id: string, revision: number) {
  const payload = `${id}:${revision}:${Date.now() + 15 * 60 * 1000}`;
  return (
    Buffer.from(payload).toString("base64url") +
    "." +
    createHmac("sha256", secret()).update(payload).digest("hex")
  );
}
export function verifyPreview(token: string, id: string, revision: number) {
  try {
    const [encoded, sig] = token.split(".");
    const payload = Buffer.from(encoded, "base64url").toString();
    const expected = createHmac("sha256", secret()).update(payload).digest();
    const actual = Buffer.from(sig, "hex");
    const [a, b, expires] = payload.split(":");
    return (
      actual.length === expected.length &&
      timingSafeEqual(actual, expected) &&
      a === id &&
      Number(b) === revision &&
      Number(expires) > Date.now()
    );
  } catch {
    return false;
  }
}
