export type ResolveRequestCredentialsOptions = {
  /**
   * API base URL, typically from app config.
   *
   * When empty, requests are treated as same-origin.
   */
  apiBaseUrl: string;
  /**
   * The current page origin (e.g. `window.location.origin`).
   *
   * When missing (non-browser environments), requests are treated as same-origin.
   */
  locationOrigin?: string | null;
};

export function resolveRequestCredentials(
  options: ResolveRequestCredentialsOptions,
): RequestCredentials {
  const apiBaseUrl = options.apiBaseUrl.trim();
  const locationOrigin = options.locationOrigin?.trim() ?? "";

  if (!locationOrigin) return "same-origin";
  if (!apiBaseUrl) return "same-origin";

  const apiOrigin = new URL(apiBaseUrl, locationOrigin).origin;
  return apiOrigin === locationOrigin ? "same-origin" : "include";
}

export type BuildLocaleHeadersOptions = {
  locale: string;
  /**
   * Optional user-chosen locale override (explicit).
   * When provided, it is sent as `x-locale` for server-side locale resolution.
   */
  localePreference?: string | null;
};

export function buildLocaleHeaders(options: BuildLocaleHeadersOptions): {
  "accept-language"?: string;
  "x-locale"?: string;
} {
  const locale = options.locale.trim();
  const localePreference = options.localePreference?.trim() ?? "";

  if (!locale) {
    throw new Error("buildLocaleHeaders: locale must be a non-empty string");
  }

  const headers: { "accept-language"?: string; "x-locale"?: string } = {
    "accept-language": locale,
  };
  if (localePreference) headers["x-locale"] = localePreference;
  return headers;
}
