import { PORTAL_NAMESPACES } from "./namespaces";

export function rewritePortalInputPathname(pathname: string): string {
  // Sprint 2+ (editor mode): keep `/__editor/*` as a public namespace while our file-based routes
  // avoid `__` segments (TanStack Router reserves `__` for special files like `__root`).

  if (pathname === PORTAL_NAMESPACES.editorHost.external)
    return PORTAL_NAMESPACES.editorHost.internal;
  if (pathname === PORTAL_NAMESPACES.editor.external) return PORTAL_NAMESPACES.editor.internal;
  if (pathname.startsWith(PORTAL_NAMESPACES.editor.external + "/")) {
    return (
      PORTAL_NAMESPACES.editor.internal +
      "/" +
      pathname.slice((PORTAL_NAMESPACES.editor.external + "/").length)
    );
  }

  // Preview mode namespace: `/__preview/*` -> internal `/preview/*`
  if (pathname === PORTAL_NAMESPACES.preview.external) return PORTAL_NAMESPACES.preview.internal;
  if (pathname.startsWith(PORTAL_NAMESPACES.preview.external + "/")) {
    return (
      PORTAL_NAMESPACES.preview.internal +
      "/" +
      pathname.slice((PORTAL_NAMESPACES.preview.external + "/").length)
    );
  }

  return pathname;
}

export function rewritePortalOutputPathname(pathname: string): string {
  // Reverse mapping so link generation and navigations keep the public URL shape.

  if (pathname === PORTAL_NAMESPACES.editorHost.internal)
    return PORTAL_NAMESPACES.editorHost.external;
  if (pathname === PORTAL_NAMESPACES.editor.internal) return PORTAL_NAMESPACES.editor.external;
  if (pathname.startsWith(PORTAL_NAMESPACES.editor.internal + "/")) {
    return (
      PORTAL_NAMESPACES.editor.external +
      "/" +
      pathname.slice((PORTAL_NAMESPACES.editor.internal + "/").length)
    );
  }

  if (pathname === PORTAL_NAMESPACES.preview.internal) return PORTAL_NAMESPACES.preview.external;
  if (pathname.startsWith(PORTAL_NAMESPACES.preview.internal + "/")) {
    return (
      PORTAL_NAMESPACES.preview.external +
      "/" +
      pathname.slice((PORTAL_NAMESPACES.preview.internal + "/").length)
    );
  }

  return pathname;
}
