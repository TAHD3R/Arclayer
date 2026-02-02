export type OriginMatcher =
  | string
  | readonly string[]
  | ((origin: string) => boolean);

export function isAllowedOrigin(origin: string, expected: OriginMatcher): boolean {
  if (typeof expected === "string") return origin === expected;
  if (typeof expected === "function") return expected(origin);
  return expected.includes(origin);
}

export function isHttpOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
