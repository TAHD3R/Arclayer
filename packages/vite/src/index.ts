// NOTE: Vite loads config/plugins via native ESM in Node. When these files are TypeScript
// and linked via workspace, we must use explicit extensions to avoid ERR_MODULE_NOT_FOUND.
export { injectAppConfig } from "./inject-app-config.ts";
export type { InjectAppConfigOptions } from "./inject-app-config.ts";

export { injectPreferences } from "./inject-preferences.ts";
export type { InjectPreferencesOptions } from "./inject-preferences.ts";

export { injectLoadingScreen } from "./inject-loading-screen.ts";
export type { InjectLoadingScreenOptions } from "./inject-loading-screen.ts";
