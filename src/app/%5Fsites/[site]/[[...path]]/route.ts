import { cookies } from "next/headers";
import { readFile, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { lookup } from "mime-types";
import { endpoint, fail } from "@/lib/http";
import { siteIdentity } from "@/lib/hosts";
import { verifyPreview } from "@/lib/auth";
import { rows } from "@/lib/db";
import { getRevision, getProject } from "@/lib/designs";
import { safePath, diskPath } from "@/lib/storage";
import { renderTemplate, templateValues } from "@/lib/templates";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ site: string; path?: string[] }> },
) {
  return endpoint(async () => {
    const p = await params,
      site = siteIdentity(req.headers.get("host") || "");
    if (!site || site.label !== p.site) fail(404, "Not found");
    const [design] = await rows<{
      project_id: string;
      published_revision: number | null;
      published_path: string | null;
    }>(
      "SELECT d.project_id,d.published_revision,d.published_path FROM designs d JOIN projects p ON p.id=d.project_id AND p.deleted_at IS NULL WHERE d.id=?",
      [site.id],
    );
    if (!design) fail(404, "Website not found");
    const preview = site.revision !== null;
    const url = new URL(req.url);
    const token = url.searchParams.get("preview");
    const cookie = "launch_preview";
    if (preview) {
      if (token) {
        if (!verifyPreview(token, site.id, site.revision!))
          fail(
            403,
            "Preview link expired. Open a new preview from the workspace.",
          );
        const jar = await cookies();
        jar.set(cookie, token, {
          httpOnly: true,
          secure: process.env.SITE_PROTOCOL === "https",
          sameSite: "lax",
          maxAge: 900,
          path: "/",
        });
        const clean = new URL(
          `${process.env.SITE_PROTOCOL}://${req.headers.get("host")}/${(p.path || []).map(encodeURIComponent).join("/")}`,
        );
        url.searchParams.delete("preview");
        clean.search = url.searchParams.toString();
        return new Response(null, {
          status: 303,
          headers: {
            Location: clean.toString(),
            "Cache-Control": "no-store",
            "Referrer-Policy": "no-referrer",
          },
        });
      }
      if (
        !verifyPreview(
          (await cookies()).get(cookie)?.value || "",
          site.id,
          site.revision!,
        )
      )
        fail(403, "Open this preview from the workspace.");
    } else if (!design.published_path || !design.published_revision)
      fail(404, "This website is not published");
    const revision = await getRevision(
      site.id,
      site.revision || design.published_revision!,
    );
    let file = p.path?.join("/") || revision.entryPoint;
    safePath(file);
    if (!revision.entries.some((e) => e.path === file)) {
      const index = `${file}/index.html`;
      if (revision.entries.some((e) => e.path === index)) {
        if (!url.pathname.endsWith("/"))
          return new Response(null, {
            status: 308,
            headers: {
              Location: `/${file.split("/").map(encodeURIComponent).join("/")}/`,
            },
          });
        file = index;
      } else fail(404, "File not found");
    }
    // Redirect the root to a nested entry page so relative asset paths keep working.
    if (!p.path?.length && revision.entryPoint.includes("/"))
      return new Response(null, {
        status: 302,
        headers: {
          Location:
            "/" +
            revision.entryPoint.split("/").map(encodeURIComponent).join("/"),
          "Cache-Control": "no-store",
        },
      });
    const target = diskPath(
      `${preview ? revision.storagePath : design.published_path}/${file}`,
    );
    const headers: Record<string, string> = {
      "Content-Type": lookup(file) || "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy":
        "sandbox allow-scripts allow-same-origin allow-forms allow-popups allow-downloads; frame-ancestors " +
        process.env.APP_ORIGIN,
    };
    if (/\.html?$/i.test(file)) {
      headers["Content-Type"] = "text/html; charset=utf-8";
      let html = await readFile(target, "utf8");
      if (preview)
        html = renderTemplate(
          html,
          templateValues(await getProject(design.project_id)),
        );
      return new Response(html, { headers });
    }
    const info = await stat(target);
    headers["Content-Length"] = String(info.size);
    return new Response(
      Readable.toWeb(createReadStream(target)) as ReadableStream,
      { headers },
    );
  });
}
