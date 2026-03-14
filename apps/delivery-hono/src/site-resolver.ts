export type TenantConfig = {
  tenantId: string;
  workspaceId: string;
  siteId: string;
  host: string;
  pathPrefix?: string;
  defaultLocale: string;
};

export type ResolvedSite = {
  tenantId: string;
  workspaceId: string;
  siteId: string;
  locale: string;
  routePath: string;
};

function normalizePath(pathname: string, pathPrefix?: string): string | null {
  if (!pathPrefix) {
    return pathname || "/";
  }
  if (!pathname.startsWith(pathPrefix)) {
    return null;
  }
  const stripped = pathname.slice(pathPrefix.length);
  if (!stripped || stripped === "/") {
    return "/";
  }
  return stripped.startsWith("/") ? stripped : `/${stripped}`;
}

function resolveHost(request: Request): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost) {
    const [first] = forwardedHost.split(",");
    return first.trim().toLowerCase();
  }
  return new URL(request.url).host.toLowerCase();
}

export function resolveSiteFromRequest(
  request: Request,
  tenants: readonly TenantConfig[],
): ResolvedSite | null {
  const url = new URL(request.url);
  const host = resolveHost(request);
  const locale = url.searchParams.get("locale");
  for (const tenant of tenants) {
    if (tenant.host.toLowerCase() !== host) {
      continue;
    }
    const routePath = normalizePath(url.pathname, tenant.pathPrefix);
    if (routePath == null) {
      continue;
    }
    return {
      tenantId: tenant.tenantId,
      workspaceId: tenant.workspaceId,
      siteId: tenant.siteId,
      locale: locale || tenant.defaultLocale,
      routePath,
    };
  }
  return null;
}
