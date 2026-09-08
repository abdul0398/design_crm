import { z } from "zod";
import { endpoint, bodyJson } from "@/lib/http";
import { requireUser, signPreview } from "@/lib/auth";
import { rows } from "@/lib/db";
import { fail } from "@/lib/http";
import { getRevision, siteUrl } from "@/lib/designs";
export async function POST(req: Request) {
  return endpoint(async () => {
    await requireUser(req);
    const { id, revision } = z
      .object({ id: z.uuid(), revision: z.number().int().positive() })
      .parse(await bodyJson(req));
    await getRevision(id, revision);
    const [design] = await rows<{ published_at: string | null }>(
      "SELECT published_at FROM designs WHERE id=? AND deleted_at IS NULL",
      [id],
    );
    if (!design) fail(404, "Design not found");
    return Response.json({
      url: design.published_at
        ? siteUrl(id)
        : `${siteUrl(id, 1)}/?preview=${signPreview(id, 1)}`,
    });
  });
}
