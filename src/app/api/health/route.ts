import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { rows } from "@/lib/db";
import { root } from "@/lib/storage";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await rows("SELECT 1");
    await access(root(), constants.W_OK);
    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503 });
  }
}
