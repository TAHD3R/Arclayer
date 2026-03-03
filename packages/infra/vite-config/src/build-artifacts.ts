import type { Plugin } from "vite";

import { archiveBuildOutput, type ArchiveBuildOutputOptions } from "./archive-build-output.ts";
import { injectBuildMeta, type InjectBuildMetaOptions } from "./inject-build-meta.ts";
import { injectCopyrightBanner, type CopyrightBannerOptions } from "./inject-copyright-banner.ts";

export interface CelestialBuildArtifactsOptions {
  buildMeta: InjectBuildMetaOptions;
  banner: CopyrightBannerOptions;
  archive: ArchiveBuildOutputOptions;
}

export function celestialBuildArtifacts(options: CelestialBuildArtifactsOptions): Plugin[] {
  return [
    injectBuildMeta(options.buildMeta),
    injectCopyrightBanner(options.banner),
    archiveBuildOutput(options.archive),
  ];
}
