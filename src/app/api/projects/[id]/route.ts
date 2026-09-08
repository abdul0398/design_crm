import { z } from "zod";
import { projectIdentity } from "@/lib/project-input";
import { endpoint, bodyJson, fail } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject } from "@/lib/designs";
const schema = projectIdentity.partial();
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return endpoint(async () => {
    await requireUser(req);
    return Response.json(await getProject((await params).id));
  });
}
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return endpoint(async () => {
    await requireUser(req);
    const id = (await params).id;
    const existing = await getProject(id);
    const p = { ...existing, ...schema.parse(await bodyJson(req)) };
    await db().execute(
      "UPDATE projects SET name=?,site=?,developer=?,launch_window=? WHERE id=? AND deleted_at IS NULL",
      [p.name, p.site, p.developer, p.window, id],
    );
    return Response.json(await getProject(id));
  });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return endpoint(async () => {
    await requireUser(req);
    const { id } = await params;
    const { name } = z.object({ name: z.string() }).parse(await bodyJson(req));
    const connection = await db().getConnection();
    try {
      await connection.beginTransaction();
      const [found] = await connection.execute(
        "SELECT name FROM projects WHERE id=? AND deleted_at IS NULL FOR UPDATE",
        [id],
      );
      const project = (found as { name: string }[])[0];
      if (!project) fail(404, "Project not found");
      if (name !== project.name)
        fail(409, "Project name changed. Refresh before deleting.");
      await connection.execute(
        "UPDATE projects SET deleted_at=UTC_TIMESTAMP(3) WHERE id=?",
        [id],
      );
      await connection.execute(
        "UPDATE designs SET published_revision=NULL,published_path=NULL,published_at=NULL WHERE project_id=?",
        [id],
      );
      await connection.commit();
      return Response.json({ ok: true });
    } catch (e) {
      await connection.rollback();
      throw e;
    } finally {
      connection.release();
    }
  });
}
