import { type Plugin } from "vite";

export interface StaticAppConfig {
  title: string;
  apiBaseUrl: string;
  apiPrefix: string;
}

export interface StaticAppConfigPluginOptions {
  config: StaticAppConfig;
  description?: string;
  moduleId?: string;
}

const DEFAULT_MODULE_ID = "virtual:arclayer-app-config";
const RESOLVED_PREFIX = "\0";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function staticAppConfig(options: StaticAppConfigPluginOptions): Plugin {
  const moduleId = options.moduleId || DEFAULT_MODULE_ID;
  const resolvedModuleId = `${RESOLVED_PREFIX}${moduleId}`;
  const appConfig = {
    title: options.config.title.trim() || "Arclayer",
    apiBaseUrl: options.config.apiBaseUrl.trim(),
    apiPrefix: options.config.apiPrefix.trim() || "/api/v1",
  } satisfies StaticAppConfig;
  const description = (options.description || `${appConfig.title} Admin`).trim();

  return {
    name: "arclayer-static-app-config",
    enforce: "pre",
    resolveId(source) {
      if (source === moduleId) return resolvedModuleId;
      return null;
    },
    load(id) {
      if (id !== resolvedModuleId) return null;
      const serialized = JSON.stringify(appConfig, null, 2);
      return [
        `const appConfig = Object.freeze(${serialized});`,
        "export { appConfig };",
        "export default appConfig;",
      ].join("\n");
    },
    transformIndexHtml(html) {
      const nextTitle = `<title>${escapeHtml(appConfig.title)}</title>`;
      const nextDescription = `<meta name="description" content="${escapeHtml(description)}" />`;

      return html
        .replace(/<title>.*?<\/title>/i, nextTitle)
        .replace(
          /<meta\s+name=["']description["']\s+content=["'][^"']*["']\s*\/>/i,
          nextDescription,
        );
    },
  };
}
