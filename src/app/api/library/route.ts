import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { endpoint, limitedBody, bodyJson, fail } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { listDesigns, getProject } from "@/lib/designs";
import { storeUpload, discard } from "@/lib/storage";
const status = z.enum(["Unused", "Active", "Suspended"]);
const fields = z.object({
  id: z.uuid().optional(),
  project: z.string().min(1).max(40),
  name: z.string().trim().min(1).max(100),
  format: z.enum([
    "Landing page",
    "Brochure",
    "Social post",
    "Website",
    "Other",
  ]),
  status,
  url: z.union([
    z.literal(""),
    z
      .url()
      .max(2048)
      .refine((s) => /^https?:\/\//i.test(s), "Use HTTP or HTTPS"),
  ]),
  expectedRevision: z.coerce.number().int().min(0),
});
export async function GET(req: Request) {
  return endpoint(async () => {
    await requireUser(req);
    return Response.json({
      designs: await listDesigns(
        new URL(req.url).searchParams.get("project") || "",
        new URL(req.url).searchParams.get("trash") === "1",
      ),
    });
  });
}
export async function POST(req: Request) {
  return endpoint(async () => {
    await requireUser(req);
    const data = await limitedBody(req, 55 * 1024 * 1024);
    const form = await new Request(req.url, {
      method: "POST",
      headers: { "content-type": req.headers.get("content-type") || "" },
      body: data,
    }).formData();
    const meta = fields.parse(
      Object.fromEntries(
        [
          "id",
          "project",
          "name",
          "format",
          "status",
          "url",
          "expectedRevision",
        ].map((k) => [k, form.get(k) ?? undefined]),
      ),
    );
    await getProject(meta.project);
    if (meta.id) {
      const [existing] = await db().execute<RowDataPacket[]>(
        "SELECT id FROM designs WHERE id=? AND project_id=? AND deleted_at IS NULL",
        [meta.id, meta.project],
      );
      if (!existing.length) fail(404, "Design not found");
    }
    const upload = await storeUpload(form);
    let connection;
    let committed = false;
    try {
      connection = await db().getConnection();
      await connection.beginTransaction();
      const [activeProject] = await connection.execute<RowDataPacket[]>(
        "SELECT id FROM projects WHERE id=? AND deleted_at IS NULL FOR SHARE",
        [meta.project],
      );
      if (!activeProject.length) fail(404, "Project not found");
      const id = meta.id || randomUUID();
      let revision = 0;
      if (meta.id) {
        const [found] = await connection.execute<RowDataPacket[]>(
          "SELECT revision FROM designs WHERE id=? AND project_id=? AND deleted_at IS NULL FOR UPDATE",
          [id, meta.project],
        );
        if (!found.length) fail(404, "Design not found");
        revision = found[0].revision;
        if (revision !== meta.expectedRevision)
          fail(409, "This design changed. Refresh before uploading again.");
      }
      if (!upload && !revision && !meta.url)
        fail(400, "Upload website files or enter a source link");
      if (!meta.id)
        await connection.execute(
          "INSERT INTO designs(id,project_id,name,format,source_url,status) VALUES(?,?,?,?,?,?)",
          [id, meta.project, meta.name, meta.format, meta.url, meta.status],
        );
      if (upload) {
        revision++;
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
      }
      await connection.execute(
        "UPDATE designs SET name=?,format=?,source_url=?,status=?,revision=? WHERE id=?",
        [meta.name, meta.format, meta.url, meta.status, revision, id],
      );
      await connection.commit();
      committed = true;
      return Response.json({ id, revision }, { status: meta.id ? 200 : 201 });
    } catch (e) {
      if (connection) await connection.rollback();
      throw e;
    } finally {
      connection?.release();
      if (upload && !committed) await discard(upload.storagePath);
    }
  });
}
export async function PATCH(req: Request) {
  return endpoint(async () => {
    await requireUser(req);
    const value = z.object({ id: z.uuid(), status }).parse(await bodyJson(req));
    const [result] = await db().execute(
      "UPDATE designs d JOIN projects p ON p.id=d.project_id AND p.deleted_at IS NULL SET d.status=? WHERE d.id=? AND d.deleted_at IS NULL",
      [value.status, value.id],
    );
    if (!(result as { affectedRows: number }).affectedRows)
      fail(404, "Design not found");
    return Response.json({ ok: true });
  });
}

export async function DELETE(req: Request) {
  return endpoint(async () => {
    await requireUser(req);
    const value = z
      .object({
        id: z.uuid(),
        name: z.string().min(1).max(100),
        expectedRevision: z.number().int().min(0),
      })
      .parse(await bodyJson(req));
    const [result] = await db().execute(
      "UPDATE designs d JOIN projects p ON p.id=d.project_id AND p.deleted_at IS NULL SET d.deleted_at=UTC_TIMESTAMP(3),d.published_revision=NULL,d.published_path=NULL,d.published_at=NULL WHERE d.id=? AND d.deleted_at IS NULL AND d.name=? AND d.revision=?",
      [value.id, value.name, value.expectedRevision],
    );
    if (!(result as { affectedRows: number }).affectedRows) {
      const [existing] = await db().execute<RowDataPacket[]>(
        "SELECT d.id FROM designs d JOIN projects p ON p.id=d.project_id AND p.deleted_at IS NULL WHERE d.id=? AND d.deleted_at IS NULL",
        [value.id],
      );
      if (!existing.length) fail(404, "Design not found");
      fail(409, "This design changed. Refresh before deleting again.");
    }
    return Response.json({ ok: true });
  });
}
