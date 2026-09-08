import { NextRequest, NextResponse } from "next/server";
import { siteIdentity } from "./lib/hosts";
export function proxy(req: NextRequest) {
  const host = req.headers.get("host") || "";
  const site = siteIdentity(host);
  if (site) {
    const url = req.nextUrl.clone();
    url.pathname = `/_sites/${site.label}${url.pathname}`;
    return NextResponse.rewrite(url);
  }
  // Read-only readiness probe also accepts load-balancer health-check Host headers.
  if (
    ["/api/health", "/api/tls/allow"].includes(req.nextUrl.pathname) &&
    req.method === "GET"
  )
    return NextResponse.next();
  if (
    host !==
    new URL(process.env.APP_ORIGIN || "http://launch.localhost:3000").host
  )
    return new NextResponse("Unknown host", { status: 404 });
  if (req.nextUrl.pathname.startsWith("/_sites/"))
    return new NextResponse("Not found", { status: 404 });
  return NextResponse.next();
}
export const config = { matcher: "/:path*" };
