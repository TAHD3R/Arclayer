import type { TokenPair } from "@arclayer/openapi";

function isRecord(input: unknown): input is Record<string, unknown> {
  return Boolean(input) && typeof input === "object";
}

export function normalizeTokenPair(tokens: unknown): {
  accessToken: string;
  refreshToken: string;
  tokenType: string | null;
  expiresIn: number;
  refreshExpiresIn: number;
} {
  if (!isRecord(tokens)) {
    throw new Error("Invalid token response");
  }

  const candidate: Partial<TokenPair> = tokens;
  if (
    typeof candidate.accessToken !== "string" ||
    typeof candidate.refreshToken !== "string" ||
    typeof candidate.expiresIn !== "number" ||
    typeof candidate.refreshExpiresIn !== "number" ||
    (candidate.tokenType !== undefined && typeof candidate.tokenType !== "string")
  ) {
    throw new Error("Invalid token response");
  }

  return {
    accessToken: candidate.accessToken,
    refreshToken: candidate.refreshToken,
    tokenType: candidate.tokenType ?? null,
    expiresIn: candidate.expiresIn,
    refreshExpiresIn: candidate.refreshExpiresIn,
  };
}
