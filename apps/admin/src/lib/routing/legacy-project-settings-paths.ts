import { normalizePath } from "@/lib/admin-nav-utils";

const LEGACY_PROJECT_SETTINGS_REWRITES: Array<[RegExp, string]> = [
  [/^(\/(?:w|projects)\/[^/]+)\/settings\/site\/basics$/, "$1/seo/site"],
  [/^(\/(?:w|projects)\/[^/]+)\/settings\/site\/localization$/, "$1/seo/site/localization"],
  [/^(\/(?:w|projects)\/[^/]+)\/settings\/site$/, "$1/seo/site"],
  [/^(\/(?:w|projects)\/[^/]+)\/settings\/localization$/, "$1/seo/site/localization"],
  [/^(\/(?:w|projects)\/[^/]+)\/settings\/domain$/, "$1/website/domain"],
  [/^(\/(?:w|projects)\/[^/]+)\/content\/domain$/, "$1/website/domain"],
  [/^(\/(?:w|projects)\/[^/]+)\/settings\/deployments$/, "$1/website/releases"],
  [/^(\/(?:w|projects)\/[^/]+)\/deployments$/, "$1/website/releases"],
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
  return normalized.replace(
    /^\/w\/([^/]+)(?=\/(?:content|seo|website)\/|\/settings\/api(?:\/|$))/,
    "/projects/$1",
  );
}
