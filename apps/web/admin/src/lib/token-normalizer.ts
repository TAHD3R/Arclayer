function getStringValue(record: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const k of keys) {
    const v = record[k];
    if (typeof v === "string") return v;
  }
  return null;
}

function getNumberValue(record: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const k of keys) {
    const v = record[k];
    if (typeof v === "number") return v;
  }
  return null;
}

function asRecord(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object") return {};
  return input as Record<string, unknown>;
}

/**
 * Normalize a token response that may use snake_case or camelCase keys.
 * Handles both Pydantic serialization styles transparently.
 */
export function normalizeTokenPair(tokens: unknown): {
  accessToken: string | null;
  refreshToken: string | null;
  tokenType: string | null;
  expiresIn: number | null;
  refreshExpiresIn: number | null;
} {
  const raw = asRecord(tokens);
  return {
    accessToken: getStringValue(raw, ["access_token", "accessToken"]),
    refreshToken: getStringValue(raw, ["refresh_token", "refreshToken"]),
    tokenType: getStringValue(raw, ["token_type", "tokenType"]),
    expiresIn: getNumberValue(raw, ["expires_in", "expiresIn"]),
    refreshExpiresIn: getNumberValue(raw, ["refresh_expires_in", "refreshExpiresIn"]),
  };
}
