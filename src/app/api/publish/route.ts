import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { endpoint, bodyJson, fail } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject, getRevision, siteUrl } from "@/lib/designs";
import { snapshot, discard } from "@/lib/storage";
import { templateValues, renderTemplate } from "@/lib/templates";
export async function POST(req: Request) {
  return endpoint(async () => {
    await requireUser(req);
    const { id, revision } = z
      .object({ id: z.uuid(), revision: z.number().int().positive() })
      .parse(await bodyJson(req));
    const connection = await db().getConnection();
    let destination: string | undefined;
    let committed = false;
    try {
      await connection.beginTransaction();
      const [data] = await connection.execute<RowDataPacket[]>(
        "SELECT * FROM designs WHERE id=? AND deleted_at IS NULL FOR UPDATE",
        [id],
      );
      const design = data[0];
      if (!design) fail(404, "Design not found");
      if (design.revision !== revision)
        fail(
          409,
          "A newer revision exists. Refresh and preview it before publishing.",
        );
      const r = await getRevision(id, revision),
        values = templateValues(await getProject(design.project_id));
      destination = await snapshot(r.storagePath, r.entries, (html) =>
        renderTemplate(html, values),
      );
      await connection.execute(
        "UPDATE designs SET published_revision=?,published_path=?,published_at=UTC_TIMESTAMP(3) WHERE id=?",
        [revision, destination, id],
      );
      await connection.commit();
      committed = true;
      return Response.json({ url: siteUrl(id) });
    } catch (e) {
      await connection.rollback();
      throw e;
    } finally {
      connection.release();
      if (destination && !committed) await discard(destination);
    }
  });
}
export async function DELETE(req: Request) {
  return endpoint(async () => {
    await requireUser(req);
    const { id } = z.object({ id: z.uuid() }).parse(await bodyJson(req));
    await db().execute(
      "UPDATE designs SET published_revision=NULL,published_path=NULL,published_at=NULL WHERE id=?",
      [id],
    );
    return Response.json({ ok: true });
  });
}
