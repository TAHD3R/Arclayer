import { type Plugin } from "vite";

export interface InjectAppConfigOptions {
  defaults: {
    title: string;
    apiBaseUrl: string;
    apiPrefix: string;
  };
  publicUrl?: string;
}

/**
 * 在 index.html 中注入一个极小的运行时配置加载器：
 * - 先写入 defaults（构建时 env 作为 fallback）
 * - 再尝试 fetch public/app-config.json 覆盖（用于“无需重新构建即可改配置”）
 * - 同步更新 document.title
 */
export function injectAppConfig(options: InjectAppConfigOptions): Plugin {
  const publicUrl = options.publicUrl ?? "/app-config.json";

  // Keep it tiny and dependency-free: it runs before React mounts.
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
