import type { RouteSync } from "vike/types";

export default ((pageContext) => {
  const pathname = pageContext.urlPathname ?? "/";
  return pathname === "/editor" || pathname.startsWith("/editor/");
}) satisfies RouteSync;
