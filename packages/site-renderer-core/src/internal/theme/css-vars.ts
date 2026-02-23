import type { DesignTokenCollection, TokenValue } from "@celestial/site-block-protocol";

export type CssVarMap = Record<string, string | number | null | undefined>;

export function serializeCssVarsToStyleText(vars: CssVarMap): string {
  const body = buildSortedCssBody(vars);
  return `:root{${body}}`;
}

/**
 * Resolve a DesignTokenCollection into per-mode CssVarMaps.
 * Performs topological $ref resolution within each mode.
 */
export function resolveTokenCollection(collection: DesignTokenCollection): {
  default: CssVarMap;
  modes: Record<string, CssVarMap>;
} {
  const result: { default: CssVarMap; modes: Record<string, CssVarMap> } = {
    default: {},
    modes: {},
  };

  for (const col of collection.collections) {
    for (const mode of col.modes) {
      // Build key→raw value map for this mode
      const raw = new Map<string, TokenValue>();
      for (const token of col.tokens) {
        const val = token.values[mode];
        if (val !== undefined) raw.set(token.key, val);
      }

      // Resolve $ref chains
      const resolved = resolveRefs(raw);
      const target = mode === "default" ? result.default : (result.modes[mode] ??= {});
      for (const [key, val] of resolved) {
        target[tokenKeyToCssVar(key)] = val;
      }
    }
  }

  return result;
}

/**
 * Serialize resolved tokens into a multi-mode style text.
 * Default mode → :root, named modes → [data-mode="<name>"].
 */
export function serializeTokensToStyleText(collection: DesignTokenCollection): string {
  const { default: def, modes } = resolveTokenCollection(collection);
  let out = `:root{${buildSortedCssBody(def)}}`;
  for (const [mode, vars] of Object.entries(modes)) {
    out += `[data-mode="${escapeCssValue(mode)}"]{${buildSortedCssBody(vars)}}`;
  }
  return out;
}

// --- internals ---

function resolveRefs(raw: Map<string, TokenValue>): Map<string, string> {
  const resolved = new Map<string, string>();
  const visiting = new Set<string>();

  function resolve(key: string): string {
    const cached = resolved.get(key);
    if (cached !== undefined) return cached;

    const val = raw.get(key);
    if (val === undefined) return "";

    if (typeof val === "string" || typeof val === "number") {
      const s = String(val);
      resolved.set(key, s);
      return s;
    }

    // $ref
    if (visiting.has(key)) return ""; // circular ref guard
    visiting.add(key);
    const s = resolve(val.$ref);
    visiting.delete(key);
    resolved.set(key, s);
    return s;
  }

  for (const key of raw.keys()) resolve(key);
  return resolved;
}

function tokenKeyToCssVar(key: string): string {
  return key.replaceAll(".", "-");
}

function buildSortedCssBody(vars: CssVarMap): string {
  const entries = Object.entries(vars)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => [normalizeVarName(k), String(v)] as const)
    .filter(([k, v]) => k.length > 0 && v.length > 0);

  entries.sort(([a], [b]) => a.localeCompare(b));
  return entries.map(([k, v]) => `${k}: ${escapeCssValue(v)};`).join("");
}

function normalizeVarName(name: string): string {
  const n = name.trim();
  if (!n) return "";
  return n.startsWith("--") ? n : `--${n}`;
}

function escapeCssValue(value: string): string {
  return value.replaceAll("</style", "<\\/style");
}
