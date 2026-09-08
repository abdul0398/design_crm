import { z } from "zod";
import { endpoint, bodyJson } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject } from "@/lib/designs";
import { agencies } from "@/lib/catalog";
const url = z.union([
  z.literal(""),
  z
    .url()
    .max(2048)
    .refine((s) => /^https?:\/\//i.test(s), "Use an HTTP or HTTPS URL"),
]);
const schema = z.object({
  units: z.string().max(30),
  details: z.string().max(10000),
  folderUrl: url,
  client: z.object({
    name: z.string().max(100),
    mobile: z.string().max(24),
    cea: z.string().regex(/^(|[Rr][0-9]{6}[A-Za-z])$/),
    agency: z.string().refine((s) => agencies.some((a) => a.id === s)),
  }),
});
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
    await getProject(id);
    const p = schema.parse(await bodyJson(req));
    await db().execute(
      "UPDATE projects SET units=?,details=?,folder_url=?,client=? WHERE id=?",
      [p.units, p.details, p.folderUrl, JSON.stringify(p.client), id],
    );
    return Response.json(await getProject(id));
  });
}
