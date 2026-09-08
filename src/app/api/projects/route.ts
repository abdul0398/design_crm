import { endpoint } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { rows } from "@/lib/db";
export async function GET(req: Request) {
  return endpoint(async () => {
    await requireUser(req);
    return Response.json({
      projects: await rows(
        "SELECT p.id,p.name,p.site,p.developer,p.launch_window AS `window`,(SELECT COUNT(*) FROM designs d WHERE d.project_id=p.id) AS count FROM projects p ORDER BY p.id",
      ),
    });
  });
}
