import { timingSafeEqual } from "node:crypto";
import { endpoint, fail } from "@/lib/http";
import { rows } from "@/lib/db";
import { siteIdentity } from "@/lib/hosts";
// Caddy calls this over the private Docker network before obtaining certificates.
export async function GET(req: Request) {
  return endpoint(async () => {
    const url = new URL(req.url);
    const expected = Buffer.from(process.env.TLS_ASK_SECRET || "");
    const supplied = Buffer.from(url.searchParams.get("token") || "");
    if (
      expected.length < 32 ||
      expected.length !== supplied.length ||
      !timingSafeEqual(expected, supplied)
    )
      fail(403, "Forbidden");
    const domain = (url.searchParams.get("domain") || "").toLowerCase();
    if (domain === new URL(process.env.APP_ORIGIN!).hostname)
      return new Response(null, { status: 204 });
    const site = siteIdentity(domain);
    if (!site) fail(403, "Unknown hostname");
    const found = site.revision
      ? await rows(
          "SELECT r.design_id FROM revisions r JOIN designs d ON d.id=r.design_id JOIN projects p ON p.id=d.project_id AND p.deleted_at IS NULL WHERE r.design_id=? AND (r.revision=? OR ?=1) AND d.deleted_at IS NULL",
          [site.id, site.revision, site.revision],
        )
      : await rows(
          "SELECT d.id FROM designs d JOIN projects p ON p.id=d.project_id AND p.deleted_at IS NULL WHERE d.id=? AND d.deleted_at IS NULL",
          [site.id],
        );
    if (!found.length) fail(403, "Unknown website");
    return new Response(null, { status: 204 });
  });
}
