export function rewritePortalInputPathname(pathname: string): string {
  // Sprint 2+ (editor mode): keep `/__editor/*` as a public namespace while our file-based routes
  // avoid `__` segments (TanStack Router reserves `__` for special files like `__root`).

  if (pathname === "/__editor-host") return "/editor-host";
  if (pathname === "/__editor") return "/editor";
  if (pathname.startsWith("/__editor/")) return "/editor/" + pathname.slice("/__editor/".length);

  return pathname;
}

export function rewritePortalOutputPathname(pathname: string): string {
  // Reverse mapping so link generation and navigations keep the public URL shape.

  if (pathname === "/editor-host") return "/__editor-host";
  if (pathname === "/editor") return "/__editor";
  if (pathname.startsWith("/editor/")) return "/__editor/" + pathname.slice("/editor/".length);

  return pathname;
}
