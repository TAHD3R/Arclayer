// NOTE: Vite loads config/plugins via native ESM in Node. When these files are TypeScript
// and linked via workspace, we must use explicit extensions to avoid ERR_MODULE_NOT_FOUND.
export { injectAppConfig } from "./inject-app-config.ts";
export type { InjectAppConfigOptions } from "./inject-app-config.ts";

export { injectPreferences } from "./inject-preferences.ts";
export type { InjectPreferencesOptions } from "./inject-preferences.ts";

export { injectLoadingScreen } from "./inject-loading-screen.ts";
export type { InjectLoadingScreenOptions } from "./inject-loading-screen.ts";

export { injectBuildMeta } from "./inject-build-meta.ts";
export type { InjectBuildMetaOptions, BuildMeta } from "./inject-build-meta.ts";

export { injectCopyrightBanner } from "./inject-copyright-banner.ts";
export type { CopyrightBannerOptions } from "./inject-copyright-banner.ts";

export { archiveBuildOutput } from "./archive-build-output.ts";
export type { ArchiveBuildOutputOptions } from "./archive-build-output.ts";

export { celestialBuildArtifacts } from "./build-artifacts.ts";
export type { CelestialBuildArtifactsOptions } from "./build-artifacts.ts";
