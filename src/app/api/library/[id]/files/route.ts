import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { endpoint, limitedBody, fail } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { db, rows } from "@/lib/db";
import { getRevision } from "@/lib/designs";
import { replaceRevisionFile, discard, type StoredUpload } from "@/lib/storage";
export const runtime = "nodejs";
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return endpoint(async () => {
    await requireUser(req);
    const id = z.uuid().parse((await params).id);
    const data = await limitedBody(req, 55 * 1024 * 1024);
    const form = await new Request(req.url, {
      method: "POST",
      headers: { "content-type": req.headers.get("content-type") || "" },
      body: data,
    }).formData();
    const expectedRevision = z.coerce
      .number()
      .int()
      .positive()
      .parse(form.get("expectedRevision"));
    const path = z.string().min(1).max(1024).parse(form.get("path"));
    const file = form.get("file");
    if (!(file instanceof File) || form.getAll("file").length !== 1)
      fail(400, "Choose one replacement file");
    const [design] = await rows<{ project_id: string }>(
      "SELECT d.project_id FROM designs d JOIN projects p ON p.id=d.project_id AND p.deleted_at IS NULL WHERE d.id=? AND d.deleted_at IS NULL",
      [id],
    );
    if (!design) fail(404, "Design not found");
    const connection = await db().getConnection();
    let upload: StoredUpload | undefined;
    let committed = false;
    try {
      await connection.beginTransaction();
      const [projects] = await connection.execute<RowDataPacket[]>(
        "SELECT id FROM projects WHERE id=? AND deleted_at IS NULL FOR SHARE",
        [design.project_id],
      );
      if (!projects.length) fail(404, "Project not found");
      const [designs] = await connection.execute<RowDataPacket[]>(
        "SELECT revision FROM designs WHERE id=? AND deleted_at IS NULL FOR UPDATE",
        [id],
      );
      if (!designs.length) fail(404, "Design not found");
      if (designs[0].revision !== expectedRevision)
        fail(
          409,
          "This design changed. Close this dialog and reopen Files before updating again.",
        );
      const source = await getRevision(id, expectedRevision);
      upload = await replaceRevisionFile(source, path, file);
      const revision = expectedRevision + 1;
      await connection.execute(
        "INSERT INTO revisions(design_id,revision,storage_path,entry_point,manifest,byte_size) VALUES(?,?,?,?,?,?)",
        [
          id,
          revision,
          upload.storagePath,
          upload.entryPoint,
          JSON.stringify(upload.entries),
          upload.bytes,
        ],
      );
      await connection.execute("UPDATE designs SET revision=? WHERE id=?", [
        revision,
        id,
      ]);
      await connection.commit();
      committed = true;
      return Response.json({ id, revision });
    } catch (e) {
      await connection.rollback();
      throw e;
    } finally {
      connection.release();
      if (upload && !committed) await discard(upload.storagePath);
    }
  });
}
