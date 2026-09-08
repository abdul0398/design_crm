import { rows, jsonValue } from "./db";
import type { Design, Project, Entry } from "./catalog";
import { fail } from "./http";
export function siteUrl(id: string, revision?: number) {
  return `${process.env.SITE_PROTOCOL || "http"}://${id}${revision ? "-r" + revision : ""}.${process.env.SITE_BASE_DOMAIN}`;
}
export async function getProject(id: string): Promise<Project> {
  const data = await rows<Project>(
    "SELECT id,name,site,developer,launch_window AS `window`,units,details,folder_url AS folderUrl,client,updated_at AS updated FROM projects WHERE id=?",
    [id],
  );
  if (!data[0]) fail(404, "Project not found");
  data[0].client = jsonValue(data[0].client);
  return data[0];
}
export async function listDesigns(project: string) {
  const data = await rows<Design & { manifest: Entry[] | string | null }>(
    `SELECT d.id,d.project_id AS project,d.name,d.format,d.source_url AS url,d.status,d.revision,d.updated_at AS updated,d.published_revision AS publishedRevision,d.published_at AS published,r.entry_point AS entryPoint,r.manifest FROM designs d LEFT JOIN revisions r ON r.design_id=d.id AND r.revision=d.revision WHERE d.project_id=? ORDER BY d.updated_at DESC`,
    [project],
  );
  return data.map(({ manifest, ...d }) => ({
    ...d,
    entries: manifest ? jsonValue(manifest) : [],
    liveUrl: d.published ? siteUrl(d.id) : null,
  }));
}
export type Revision = {
  designId: string;
  revision: number;
  storagePath: string;
  entryPoint: string;
  entries: Entry[];
};
export async function getRevision(
  id: string,
  revision: number,
): Promise<Revision> {
  const result = await rows<Revision>(
    "SELECT design_id AS designId,revision,storage_path AS storagePath,entry_point AS entryPoint,manifest AS entries FROM revisions WHERE design_id=? AND revision=?",
    [id, revision],
  );
  if (!result[0]) fail(404, "Revision not found");
  return { ...result[0], entries: jsonValue(result[0].entries) };
}
