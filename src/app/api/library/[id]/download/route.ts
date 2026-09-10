import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { requireUser } from "@/lib/auth";
import { db, rows } from "@/lib/db";
import { getRevision } from "@/lib/designs";
import { endpoint, fail } from "@/lib/http";
import { websiteZip, zipFilename } from "@/lib/website-zip";

export const runtime = "nodejs";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return endpoint(async () => {
    await requireUser(req);
    const id = z.uuid().parse((await params).id);
    const [owner] = await rows<{ project_id: string }>(
      "SELECT project_id FROM designs WHERE id=? AND deleted_at IS NULL",
      [id],
    );
    if (!owner) fail(404, "Design not found");
    const connection = await db().getConnection();
    try {
      await connection.beginTransaction();
      // Match the writer lock order and hold the files stable until the ZIP is complete.
      const [projects] = await connection.execute<RowDataPacket[]>(
        "SELECT id FROM projects WHERE id=? AND deleted_at IS NULL FOR SHARE",
        [owner.project_id],
      );
      if (!projects.length) fail(404, "Project not found");
      const [designs] = await connection.execute<RowDataPacket[]>(
        "SELECT name,revision FROM designs WHERE id=? AND deleted_at IS NULL FOR SHARE",
        [id],
      );
      if (!designs.length) fail(404, "Design not found");
      const design = designs[0];
      if (!design.revision)
        fail(400, "This design has no uploaded website files");
      const files = await getRevision(id, design.revision, connection);
      const zip = await websiteZip(files);
      await connection.commit();
      return new Response(zip, {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${zipFilename(design.name)}"`,
          "Content-Length": String(zip.length),
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  });
}
