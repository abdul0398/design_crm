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
          "SELECT design_id FROM revisions WHERE design_id=? AND revision=?",
          [site.id, site.revision],
        )
      : await rows("SELECT id FROM designs WHERE id=?", [site.id]);
    if (!found.length) fail(403, "Unknown website");
    return new Response(null, { status: 204 });
  });
}
