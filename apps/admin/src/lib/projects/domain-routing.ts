const LOCAL_PLATFORM_HOST_SUFFIX = ".arclayer.localhost";

function normalizeHostname(hostname: string | null | undefined): string | null {
  const value = (hostname ?? "").trim().toLowerCase();
  return value || null;
}

export type ProjectDomainRouteBinding = {
  hostname: string;
  isActive: boolean;
  isPrimary: boolean;
  isVerified: boolean;
};

export function selectResolvedProjectDomain<T extends ProjectDomainRouteBinding>(
  domains: readonly T[],
): T | null {
  return (
    domains.find((domain) => domain.isPrimary && domain.isVerified && domain.isActive) ??
    domains.find((domain) => domain.isVerified && domain.isActive) ??
    null
  );
}

export function toProjectDomainUrl(hostname: string | null | undefined): string | null {
  const value = normalizeHostname(hostname);
  return value ? `https://${value}` : null;
}

export function resolveProjectPrimaryDomainUrl(
  domains: readonly ProjectDomainRouteBinding[],
): string | null {
  return toProjectDomainUrl(selectResolvedProjectDomain(domains)?.hostname);
}

export function isLocalPlatformHostname(hostname: string | null | undefined): boolean {
  const value = normalizeHostname(hostname);
  return value ? value.endsWith(LOCAL_PLATFORM_HOST_SUFFIX) : false;
}

export function toOpenableProjectDomainUrl(hostname: string | null | undefined): string | null {
  const value = normalizeHostname(hostname);
  if (!value || isLocalPlatformHostname(value)) return null;
  return toProjectDomainUrl(value);
}
