type JwtClaims = Record<string, unknown>;

function decodeJwtClaims(token: string): JwtClaims | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;

  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const json = atob(padded);
    return JSON.parse(json) as JwtClaims;
  } catch {
    return null;
  }
}

function asNonEmptyString(input: unknown): string | null {
  return typeof input === "string" && input.trim() ? input.trim() : null;
}

export function getUserDisplayName(accessToken: string | null, fallback: string): string {
  if (!accessToken) return fallback;
  const claims = decodeJwtClaims(accessToken);
  if (!claims) return fallback;

  return (
    asNonEmptyString(claims.name) ??
    asNonEmptyString(claims.username) ??
    asNonEmptyString(claims.preferred_username) ??
    asNonEmptyString(claims.email) ??
    fallback
  );
}

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function firstGrapheme(value: string): string {
  const first = graphemeSegmenter.segment(value)[Symbol.iterator]().next();
  return first.done ? "" : first.value.segment;
}

function initialFromToken(token: string): string {
  return firstGrapheme(firstGrapheme(token).toLocaleUpperCase());
}

export function initialsFromName(name: string, maxInitials: 1 | 2 = 2): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";

  const parts = trimmed.split(/\s+/).filter(Boolean);
  const firstInitial = initialFromToken(parts[0]!);
  if (maxInitials === 1 || parts.length === 1) return firstInitial;

  return `${firstInitial}${initialFromToken(parts[parts.length - 1]!)}`;
}

function asRecord(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== "object") return null;
  return input as Record<string, unknown>;
}

function getStringValue(record: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const k of keys) {
    const v = record[k];
    if (typeof v === "string") return v;
  }
  return null;
}

export function normalizeUserProfile(raw: unknown): {
  id: string | null;
  username: string | null;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  avatarAssetId: string | null;
} {
  const data = asRecord(raw);
  if (!data) {
    return {
      id: null,
      username: null,
      email: null,
      displayName: null,
      avatarUrl: null,
      avatarAssetId: null,
    };
  }
  return {
    id: getStringValue(data, ["userId", "id"]),
    username: getStringValue(data, ["username"]),
    email: getStringValue(data, ["email"]),
    displayName: getStringValue(data, ["display_name", "displayName"]),
    avatarUrl: getStringValue(data, ["avatar_url", "avatarUrl"]),
    avatarAssetId: getStringValue(data, ["avatar_asset_id", "avatarAssetId"]),
  };
}
