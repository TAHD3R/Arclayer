import { buildLocaleHeaders, resolveRequestCredentials } from "@arclayer/lib/http/request-context";

import { getAppConfig } from "@/constants/app-config";
import { usePreferencesStore } from "@/stores/use-preference-store";

export function getRequestCredentials(): RequestCredentials {
  const { apiBaseUrl } = getAppConfig();
  const locationOrigin = (globalThis as unknown as { location?: { origin?: string } }).location
    ?.origin;

  return resolveRequestCredentials({ apiBaseUrl, locationOrigin });
}

export function getLocaleHeaders(): {
  "accept-language"?: string;
  "x-locale"?: string;
} {
  const prefs = usePreferencesStore.getState();
  return buildLocaleHeaders({
    locale: prefs.locale,
    localePreference: prefs.localePreference,
  });
}
