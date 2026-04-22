import { normalizePath } from "@/lib/admin-nav-utils";

const LEGACY_PROJECT_SETTINGS_REWRITES: Array<[RegExp, string]> = [
  [/^(\/(?:w|projects)\/[^/]+)\/settings\/site\/basics$/, "$1/content/general"],
  [/^(\/(?:w|projects)\/[^/]+)\/settings\/site\/localization$/, "$1/content/localization"],
  [/^(\/(?:w|projects)\/[^/]+)\/settings\/site$/, "$1/content/general"],
  [/^(\/(?:w|projects)\/[^/]+)\/settings\/localization$/, "$1/content/localization"],
  [/^(\/(?:w|projects)\/[^/]+)\/settings\/domain$/, "$1/content/domain"],
  [/^(\/(?:w|projects)\/[^/]+)\/settings\/api-keys$/, "$1/settings/api"],
];

export function normalizeLegacyProjectSettingsPath(path: string): string {
  let normalized = normalizePath(path);
  let rewritten = false;
  for (const [pattern, replacement] of LEGACY_PROJECT_SETTINGS_REWRITES) {
    const next = normalized.replace(pattern, replacement);
    rewritten = rewritten || next !== normalized;
    normalized = next;
  }
  if (!rewritten) return normalized;
  return normalized.replace(/^\/w\/([^/]+)(?=\/content\/|\/settings\/api(?:\/|$))/, "/projects/$1");
}
