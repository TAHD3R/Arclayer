export function parsePlatformOrigin(value: string | undefined): string {
  if (!value) {
    throw new Error("VITE_PLATFORM_ORIGIN is required");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("VITE_PLATFORM_ORIGIN must be an absolute URL");
  }

  const validProtocol = url.protocol === "http:" || url.protocol === "https:";
  const hasOriginOnlyShape =
    url.pathname === "/" && !url.search && !url.hash && !url.username && !url.password;
  if (!validProtocol || !hasOriginOnlyShape) {
    throw new Error("VITE_PLATFORM_ORIGIN must be an HTTP(S) origin without credentials or a path");
  }

  return url.origin;
}
