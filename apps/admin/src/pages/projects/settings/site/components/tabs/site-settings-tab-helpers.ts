import type { TitlePolicy } from "@/types/site-seo";
import type { JsonValueInput } from "@arclayer/openapi/admin-types";

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

export function formatSummaryText(value: string | null | undefined): string {
  const normalized = String(value || "").trim();
  return normalized || "-";
}

export function normalizeOptionalString(value: string | null | undefined): string | null {
  const normalized = String(value || "").trim();
  return normalized || null;
}

export function normalizeLocalizedStringMapForSave(
  input: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [keyRaw, valueRaw] of Object.entries(input || {})) {
    const key = String(keyRaw || "").trim();
    const value = String(valueRaw || "").trim();
    if (!key || !value) continue;
    out[key] = value;
  }
  return out;
}

export function resolveDefaultLocaleValue(
  map: Record<string, string>,
  defaultLocale: string,
): string {
  const locale = String(defaultLocale || "").trim();
  if (locale && map[locale]?.trim()) return map[locale].trim();
  const firstValue = Object.values(map).find((value) => value.trim());
  return String(firstValue || "").trim();
}

export function toApiTitlePolicy(input: TitlePolicy): Record<string, JsonValueInput> {
  return {
    parts: input.parts,
    home_mode: input.homeMode ?? "siteOnly",
    dedupe: input.dedupe !== false,
  };
}

export function normalizeTitlePolicyForSave(input: TitlePolicy, t: TranslateFn): TitlePolicy {
  const raw = input as unknown as {
    parts?: unknown;
    homeMode?: unknown;
    home_mode?: unknown;
    dedupe?: unknown;
  };

  const partsUnknown = raw.parts;
  if (!Array.isArray(partsUnknown)) {
    throw new Error(t("settings:SETTINGS_SEO_TITLE_FORMAT_VALIDATION_INVALID"));
  }
  if (!partsUnknown.length) {
    throw new Error(t("settings:SETTINGS_SEO_TITLE_FORMAT_VALIDATION_EMPTY"));
  }
  if (partsUnknown.length > 32) {
    throw new Error(t("settings:SETTINGS_SEO_TITLE_FORMAT_VALIDATION_TOO_MANY_PARTS", { max: 32 }));
  }

  const allowedTokens = new Set(["pageTitle", "siteName", "siteSubtitle"]);
  const parts: TitlePolicy["parts"] = [];

  for (const partUnknown of partsUnknown) {
    if (!partUnknown || typeof partUnknown !== "object" || Array.isArray(partUnknown)) {
      throw new Error(t("settings:SETTINGS_SEO_TITLE_FORMAT_VALIDATION_INVALID_PART"));
    }

    const part = partUnknown as Record<string, unknown>;
    const kind = typeof part.kind === "string" ? part.kind.trim() : "";
    const valueRaw = part.value;

    if (kind === "token") {
      const token = typeof valueRaw === "string" ? valueRaw.trim() : String(valueRaw ?? "").trim();
      if (!allowedTokens.has(token)) {
        throw new Error(
          t("settings:SETTINGS_SEO_TITLE_FORMAT_VALIDATION_INVALID_TOKEN", { token }),
        );
      }
      parts.push({ kind: "token", value: token as "pageTitle" | "siteName" | "siteSubtitle" });
      continue;
    }

    if (kind === "literal") {
      const literal = typeof valueRaw === "string" ? valueRaw : String(valueRaw ?? "");
      if (literal.length > 64) {
        throw new Error(
          t("settings:SETTINGS_SEO_TITLE_FORMAT_VALIDATION_LITERAL_TOO_LONG", { max: 64 }),
        );
      }
      parts.push({ kind: "literal", value: literal });
      continue;
    }

    throw new Error(t("settings:SETTINGS_SEO_TITLE_FORMAT_VALIDATION_INVALID_PART"));
  }

  if (!parts.some((part) => part.kind === "token")) {
    throw new Error(t("settings:SETTINGS_SEO_TITLE_FORMAT_VALIDATION_REQUIRE_TOKEN"));
  }

  const homeModeRaw = (
    typeof raw.homeMode === "string"
      ? raw.homeMode
      : typeof raw.home_mode === "string"
        ? raw.home_mode
        : ""
  ).trim();

  return {
    parts,
    homeMode: homeModeRaw === "policy" || homeModeRaw === "siteOnly" ? homeModeRaw : "siteOnly",
    dedupe: typeof raw.dedupe === "boolean" ? raw.dedupe : true,
  };
}

export function formatTitlePolicySummary(input: TitlePolicy): string {
  const tokens = input.parts
    .map((part) => (part.kind === "token" ? part.value : null))
    .filter((value): value is NonNullable<typeof value> => Boolean(value));
  if (!tokens.length) return "-";
  return tokens.join(" -> ");
}
