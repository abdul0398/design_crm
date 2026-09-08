import { randomUUID } from "node:crypto";
import { projectIdentity } from "@/lib/project-input";
import { emptyClient } from "@/lib/catalog";
import { getProject } from "@/lib/designs";
import { endpoint, bodyJson } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { rows, db } from "@/lib/db";
export async function GET(req: Request) {
  return endpoint(async () => {
    await requireUser(req);
    const trash = new URL(req.url).searchParams.get("trash") === "1";
    return Response.json({
      projects: await rows(
        "SELECT p.id,p.name,p.site,p.developer,p.launch_window AS `window`,(SELECT COUNT(*) FROM designs d WHERE d.project_id=p.id) AS count FROM projects p WHERE p.deleted_at IS " +
          (trash ? "NOT NULL" : "NULL") +
          " ORDER BY p.name,p.id",
      ),
    });
  });
}

export async function POST(req: Request) {
  return endpoint(async () => {
    await requireUser(req);
    const p = projectIdentity.parse(await bodyJson(req));
    const id = randomUUID();
    await db().execute(
      "INSERT INTO projects(id,name,site,developer,launch_window,details,client) VALUES(?,?,?,?,?,?,?)",
      [
        id,
        p.name,
        p.site,
        p.developer,
        p.window,
        "",
        JSON.stringify(emptyClient),
      ],
    );
    return Response.json(await getProject(id), { status: 201 });
  });
}
