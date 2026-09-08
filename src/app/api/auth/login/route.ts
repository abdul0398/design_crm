import { z } from "zod";
import { endpoint, bodyJson, fail } from "@/lib/http";
import {
  assertAppHost,
  assertOrigin,
  hash,
  checkPassword,
  newSession,
} from "@/lib/auth";
import { db, rows } from "@/lib/db";
export const runtime = "nodejs";
export async function POST(req: Request) {
  return endpoint(async () => {
    assertAppHost(req);
    assertOrigin(req);
    const credentials = z
      .object({
        username: z.string().trim().min(1).max(254).optional(),
        email: z.string().trim().min(1).max(254).optional(),
        password: z.string().min(1).max(256),
      })
      .refine(
        (value) => Boolean(value.username || value.email),
        "Enter your username",
      )
      .parse(await bodyJson(req));
    const identifier = (credentials.username ||
      credentials.email)!.toLowerCase();
    const { password } = credentials;
    // Account-based counters are shared across processes and cannot be bypassed with a forged IP header.
    const bucket = hash(identifier);
    await db().execute(
      "INSERT IGNORE INTO login_limits(bucket,attempts,resets_at) VALUES (?,0,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE))",
      [bucket],
    );
    await db().execute(
      "UPDATE login_limits SET attempts=IF(resets_at<UTC_TIMESTAMP(),1,attempts+1),resets_at=IF(resets_at<UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE),resets_at) WHERE bucket=?",
      [bucket],
    );
    const [limit] = await rows<{ attempts: number }>(
      "SELECT attempts FROM login_limits WHERE bucket=?",
      [bucket],
    );
    if (limit.attempts > 10)
      fail(429, "Too many attempts. Try again in 15 minutes.");
    const [user] = await rows<{ id: string; password_hash: string }>(
      "SELECT id,password_hash FROM users WHERE COALESCE(username,email)=?",
      [identifier],
    );
    const valid = await checkPassword(
      password,
      user?.password_hash ||
        "00000000000000000000000000000000:" + "00".repeat(64),
    );
    if (!user || !valid) fail(401, "Username or password is incorrect");
    await db().execute("DELETE FROM login_limits WHERE bucket=?", [bucket]);
    await newSession(user.id);
    return Response.json({ ok: true });
  });
}
