import { type Plugin } from "vite";

export interface InjectPreferencesOptions {
  storageKeys?: {
    themeMode: string;
    locale: string;
  };
  defaultThemeMode?: "light" | "dark" | "system";
  defaultLocale?: "zh-CN" | "en-US" | "auto";
  /**
   * When enabled, the injected script will log warnings on failures.
   * Default: false
   */
  debug?: boolean;
}

export function injectPreferences(options: InjectPreferencesOptions = {}): Plugin {
  const storageKeys = options.storageKeys ?? {
    themeMode: "celestial:admin:theme",
    locale: "celestial:admin:locale",
  };
  const defaultThemeMode = options.defaultThemeMode ?? "system";
  const defaultLocale = options.defaultLocale ?? "auto";
  const debug = options.debug ?? false;

  const code = `
(function () {
  var __debug = ${debug ? "true" : "false"};
  try {
    var theme = localStorage.getItem(${JSON.stringify(storageKeys.themeMode)});
    if (theme !== "dark" && theme !== "light") {
      if (${JSON.stringify(defaultThemeMode)} === "light" || ${JSON.stringify(defaultThemeMode)} === "dark") {
        theme = ${JSON.stringify(defaultThemeMode)};
      } else {
        theme =
          window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light";
      }
    }
    document.documentElement.dataset.theme = theme;

    var locale = localStorage.getItem(${JSON.stringify(storageKeys.locale)});
    if (!locale) {
      if (${JSON.stringify(defaultLocale)} === "zh-CN" || ${JSON.stringify(defaultLocale)} === "en-US") {
        locale = ${JSON.stringify(defaultLocale)};
      } else {
        var lang = (navigator.language || "").toLowerCase();
        locale = lang.indexOf("zh") === 0 ? "zh-CN" : "en-US";
      }
    }
    document.documentElement.lang = locale;
  } catch (e) {
    if (__debug && typeof console !== "undefined" && console.warn) {
      console.warn("[celestial] injectPreferences failed", e);
    }
  }
})();
`.trim();

  return {
    name: "celestial-inject-preferences",
    enforce: "pre",
    transformIndexHtml() {
      return [
        {
          tag: "script",
          attrs: {},
          children: code,
          injectTo: "head",
        },
      ];
    },
  };
}
