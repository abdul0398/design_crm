import { z } from "zod";
import { endpoint, bodyJson } from "@/lib/http";
import { requireUser, signPreview } from "@/lib/auth";
import { getRevision, siteUrl } from "@/lib/designs";
export async function POST(req: Request) {
  return endpoint(async () => {
    await requireUser(req);
    const { id, revision } = z
      .object({ id: z.uuid(), revision: z.number().int().positive() })
      .parse(await bodyJson(req));
    await getRevision(id, revision);
    return Response.json({
      url: `${siteUrl(id, revision)}/?preview=${signPreview(id, revision)}`,
    });
  });
}
