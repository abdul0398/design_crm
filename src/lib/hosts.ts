export function siteIdentity(host: string) {
  const suffix = "." + process.env.SITE_BASE_DOMAIN;
  if (!host.endsWith(suffix)) return null;
  const label = host.slice(0, -suffix.length);
  const match =
    /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:-r([1-9][0-9]{0,8}))?$/.exec(
      label,
    );
  return match
    ? { id: match[1], revision: match[2] ? Number(match[2]) : null, label }
    : null;
}
