const LOCAL_PLATFORM_HOST_SUFFIX = ".arclayer.localhost";

function normalizeHostname(hostname: string | null | undefined): string | null {
  const value = (hostname ?? "").trim().toLowerCase();
  return value || null;
}

export function isLocalPlatformHostname(hostname: string | null | undefined): boolean {
  const value = normalizeHostname(hostname);
  return value ? value.endsWith(LOCAL_PLATFORM_HOST_SUFFIX) : false;
}

export function toOpenableProjectDomainUrl(hostname: string | null | undefined): string | null {
  const value = normalizeHostname(hostname);
  if (!value || isLocalPlatformHostname(value)) return null;
  return `https://${value}`;
}
