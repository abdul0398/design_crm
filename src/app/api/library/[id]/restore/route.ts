import { z } from "zod";
import { endpoint, fail } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return endpoint(async () => {
    await requireUser(req);
    const id = z.uuid().parse((await params).id);
    const [result] = await db().execute(
      "UPDATE designs d JOIN projects p ON p.id=d.project_id AND p.deleted_at IS NULL SET d.deleted_at=NULL WHERE d.id=? AND d.deleted_at IS NOT NULL",
      [id],
    );
    if (!(result as { affectedRows: number }).affectedRows)
      fail(
        404,
        "Deleted design not found. Restore its project first if it is in Trash.",
      );
    return Response.json({ ok: true });
  });
}
