import type { RouteSync } from "vike/types";

const EXCLUDE_PREFIXES = ["/preview", "/editor", "/editor-host", "/debug"] as const;

export default ((pageContext) => {
  const pathname = pageContext.urlPathname ?? "/";
  return !EXCLUDE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/"),
  );
}) satisfies RouteSync;
