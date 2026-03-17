import * as path from "node:path";
import { defineConfig, loadEnv, searchForWorkspaceRoot } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

import { compression } from "vite-plugin-compression2";

import {
  archiveBuildOutput,
  injectBuildMeta,
  injectCopyrightBanner,
  injectLoadingScreen,
  injectPreferences,
  staticAppConfig,
} from "@arclayer/vite-plugin";

const DEFAULT_APP_TITLE = "Arclayer";
const DEFAULT_API_PREFIX = "/api/v1";
const DEFAULT_API_PROXY_TARGET = "http://127.0.0.1:8000";

function parseOptionalPort(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const port = Number(value);
  return Number.isInteger(port) && port > 0 ? port : undefined;
}

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, __dirname, "VITE_");
  const workspaceRoot = searchForWorkspaceRoot(__dirname);
  const localesDir = path.resolve(workspaceRoot, "locales");
  const appConfig = {
    title: env.VITE_APP_TITLE || DEFAULT_APP_TITLE,
    apiBaseUrl: env.VITE_API_BASE_URL || "",
    apiPrefix: env.VITE_API_PREFIX || DEFAULT_API_PREFIX,
  } as const;
  const apiProxyTarget = env.VITE_API_PROXY_TARGET || DEFAULT_API_PROXY_TARGET;
  const enableProxy = !appConfig.apiBaseUrl.trim();
  const hmrPort = parseOptionalPort(env.VITE_HMR_PORT);
  const hmrClientPort = parseOptionalPort(env.VITE_HMR_CLIENT_PORT);

  const appName = "admin";
  const appVersion = process.env.npm_package_version || undefined;
  const isBuild = command === "build";

  const plugins = [
    injectPreferences({
      storageKeys: {
        themeMode: "arclayer:admin:theme",
        locale: "arclayer:admin:locale",
      },
    }),
    injectLoadingScreen({
      appName: appConfig.title,
    }),
    staticAppConfig({
      config: appConfig,
      description: `${appConfig.title} Admin`,
    }),
    tanstackRouter({
      target: "react",
      autoCodeSplitting: false,
      routesDirectory: "./src/routes",
      generatedRouteTree: "./src/routeTree.gen.ts",
    }),
    react(),
    tailwindcss(),
  ];

  if (isBuild) {
    plugins.push(injectBuildMeta({ appName, version: appVersion }));
    plugins.push(injectCopyrightBanner({ appName, version: appVersion }));
    plugins.push(
      compression({
        algorithms: ["gzip", "brotliCompress"],
        threshold: 1024,
      }),
    );
    plugins.push(archiveBuildOutput({ appName, version: appVersion }));
  }

  return {
    plugins,

    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@locales": localesDir,
      },
    },
    server: {
      // Bind broadly only when the app itself is served from a non-localhost origin.
      host: enableProxy ? "127.0.0.1" : "0.0.0.0",
      port: 5173,
      strictPort: true,
      // Keep HMR on Vite defaults unless the developer explicitly declares an override.
      hmr:
        hmrPort || hmrClientPort
          ? {
              ...(hmrPort ? { port: hmrPort } : {}),
              ...(hmrClientPort ? { clientPort: hmrClientPort } : {}),
            }
          : undefined,
      fs: {
        allow: [workspaceRoot],
      },
      proxy: enableProxy
        ? {
            "/api": {
              target: apiProxyTarget,
              changeOrigin: true,
              secure: false,
            },
          }
        : undefined,
    },
    build: {
      target: "esnext",
      minify: "esbuild",
    },
  };
});
