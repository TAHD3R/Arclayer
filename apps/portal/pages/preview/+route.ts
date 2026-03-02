import type { RouteSync } from "vike/types";

export default ((pageContext) => {
  const pathname = pageContext.urlPathname ?? "/";
  return pathname === "/preview" || pathname.startsWith("/preview/");
}) satisfies RouteSync;
