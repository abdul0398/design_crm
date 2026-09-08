import { cookies } from "next/headers";
import { endpoint } from "@/lib/http";
import { requireUser, cookieName, hash } from "@/lib/auth";
import { db } from "@/lib/db";
export async function POST(req: Request) {
  return endpoint(async () => {
    await requireUser(req);
    const jar = await cookies();
    const token = jar.get(cookieName)?.value;
    if (token)
      await db().execute("DELETE FROM sessions WHERE token_hash=?", [
        hash(token),
      ]);
    jar.delete(cookieName);
    return Response.json({ ok: true });
  });
}
