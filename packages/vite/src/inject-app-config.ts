import { type Plugin } from "vite";

export interface InjectAppConfigOptions {
  defaults: {
    title: string;
    apiBaseUrl: string;
    apiPrefix: string;
  };
  publicUrl?: string;
}

export function injectAppConfig(options: InjectAppConfigOptions): Plugin {
  const publicUrl = options.publicUrl ?? "/app-config.json";

  const code = `
(function () {
  try {
    var defaults = ${JSON.stringify(options.defaults)};
    var current = window.__APP_CONFIG__ && typeof window.__APP_CONFIG__ === "object" ? window.__APP_CONFIG__ : {};
    window.__APP_CONFIG__ = Object.assign({}, defaults, current);
    if (window.__APP_CONFIG__.title) document.title = window.__APP_CONFIG__.title;
    fetch(${JSON.stringify(publicUrl)}, { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (cfg) {
        if (!cfg || typeof cfg !== "object") return;
        window.__APP_CONFIG__ = Object.assign({}, window.__APP_CONFIG__, cfg);
        if (cfg.title) document.title = cfg.title;
      })
      .catch(function () {});
  } catch (e) {}
})();
`.trim();

  return {
    name: "celestial-inject-app-config",
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
