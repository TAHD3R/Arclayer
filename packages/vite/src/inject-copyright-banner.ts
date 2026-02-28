import type { Plugin } from "vite";

import {
  buildDefaultBanner,
  resolveBuildMeta,
  type BuildMeta,
} from "./internal/build-meta.ts";

export interface CopyrightBannerOptions {
  appName: string;
  version?: string;
  buildTime?: string;
  gitSha?: string;

  /**
   * Only inject into entry chunks.
   * Default: true
   */
  entryOnly?: boolean;

  /**
   * Customize banner text. When provided, this overrides the default template.
   */
  bannerText?: string;
}

export function injectCopyrightBanner(options: CopyrightBannerOptions): Plugin {
  const entryOnly = options.entryOnly ?? true;

  const meta: BuildMeta = resolveBuildMeta({
    appName: options.appName,
    version: options.version,
    buildTime: options.buildTime,
    gitSha: options.gitSha,
  });

  const banner = options.bannerText?.trim() ? options.bannerText.trim() : buildDefaultBanner(meta);

  return {
    name: "celestial-inject-copyright-banner",
    apply: "build",
    generateBundle(_outputOptions, bundle) {
      for (const item of Object.values(bundle)) {
        if (item.type !== "chunk") continue;
        if (entryOnly && !item.isEntry) continue;

        // Prepend banner with a newline boundary.
        item.code = `${banner}\n${item.code}`;
      }
    },
  };
}
