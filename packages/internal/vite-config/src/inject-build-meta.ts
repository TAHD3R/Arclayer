import type { Plugin } from "vite";

import { resolveBuildMeta, type BuildMeta } from "./internal/build-meta.ts";

export type { BuildMeta };

export interface InjectBuildMetaOptions {
  appName: string;
  version?: string;
  buildTime?: string;
  gitSha?: string;

  /**
   * Inject a build meta constant via Vite `define`.
   * Default: true
   */
  defineGlobal?: boolean;

  /**
   * Emit a JSON file (default: dist/build-meta.json).
   * Default: true
   */
  emitJsonFile?: boolean;

  /**
   * Default: build-meta.json
   */
  jsonFileName?: string;

  /**
   * Default: __CELESTIAL_BUILD_META__
   */
  globalConstName?: string;
}

export function injectBuildMeta(options: InjectBuildMetaOptions): Plugin {
  const defineGlobal = options.defineGlobal ?? true;
  const emitJsonFile = options.emitJsonFile ?? true;
  const jsonFileName = options.jsonFileName ?? "build-meta.json";
  const globalConstName = options.globalConstName ?? "__CELESTIAL_BUILD_META__";

  // Vite plugins are created in the app package context (cwd = app root by pnpm).
  // Keep meta stable for the full build.
  const meta = resolveBuildMeta({
    appName: options.appName,
    version: options.version,
    buildTime: options.buildTime,
    gitSha: options.gitSha,
  });

  return {
    name: "arclayer-inject-build-meta",
    apply: "build",
    config() {
      if (!defineGlobal) return;
      return {
        define: {
          [globalConstName]: JSON.stringify(meta),
        },
      };
    },
    generateBundle() {
      if (!emitJsonFile) return;
      this.emitFile({
        type: "asset",
        fileName: jsonFileName,
        source: JSON.stringify(meta, null, 2),
      });
    },
  };
}
