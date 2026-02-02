export type CssVarMap = Record<string, string | number | null | undefined>;

export function serializeCssVarsToStyleText(vars: CssVarMap): string {
  const entries = Object.entries(vars)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => [normalizeVarName(k), String(v)] as const)
    .filter(([k, v]) => k.length > 0 && v.length > 0);

  // Deterministic output for stable snapshots/debugging.
  entries.sort(([a], [b]) => a.localeCompare(b));

  const body = entries.map(([k, v]) => `${k}: ${escapeCssValue(v)};`).join("");
  return `:root{${body}}`;
}

function normalizeVarName(name: string): string {
  const n = name.trim();
  if (!n) return "";
  return n.startsWith("--") ? n : `--${n}`;
}

function escapeCssValue(value: string): string {
  // Minimal hardening: avoid breaking out of the style tag.
  // This isn't a complete sanitizer, but it's enough for our controlled config sources in Sprint 1.
  return value.replaceAll("</style", "<\\/style");
}
