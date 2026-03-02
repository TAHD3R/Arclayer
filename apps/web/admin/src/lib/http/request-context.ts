import { getAppConfig } from "@/constants/app-config";
import { usePreferencesStore } from "@/stores/use-preference-store";

export function getRequestCredentials(): RequestCredentials {
  const { apiBaseUrl } = getAppConfig();
  const locationOrigin = (globalThis as unknown as { location?: { origin?: string } }).location
    ?.origin;

  // In non-browser environments, fall back to fetch default behavior (same-origin cookies only).
  if (!locationOrigin) return "same-origin";
  if (!apiBaseUrl) return "same-origin";

  try {
    const apiOrigin = new URL(apiBaseUrl, locationOrigin).origin;
    return apiOrigin === locationOrigin ? "same-origin" : "include";
  } catch {
    return "same-origin";
  }
}

export function getLocaleHeaders(): { "accept-language"?: string; "x-locale"?: string } {
  const prefs = usePreferencesStore.getState();
  const headers: { "accept-language"?: string; "x-locale"?: string } = {};

  // Always send Accept-Language for best-effort; only send X-Locale when user explicitly chose.
  headers["accept-language"] = prefs.locale;
  if (prefs.localePreference) {
    headers["x-locale"] = prefs.localePreference;
  }

  return headers;
}
