import { endpoint, fail } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject } from "@/lib/designs";
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return endpoint(async () => {
    await requireUser(req);
    const { id } = await params;
    const [result] = await db().execute(
      "UPDATE projects SET deleted_at=NULL WHERE id=? AND deleted_at IS NOT NULL",
      [id],
    );
    if (!(result as { affectedRows: number }).affectedRows)
      fail(404, "Deleted project not found");
    return Response.json(await getProject(id));
  });
}
