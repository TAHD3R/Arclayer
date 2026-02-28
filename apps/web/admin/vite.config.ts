import { defineConfig, loadEnv, searchForWorkspaceRoot } from "vite";
import path from "path";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

import { compression } from "vite-plugin-compression2";

import {
  archiveBuildOutput,
  celestialReactInspector,
  injectAppConfig,
  injectBuildMeta,
  injectCopyrightBanner,
  injectLoadingScreen,
  injectPreferences,
} from "@celestial/vite";

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, __dirname, "VITE_");
  const workspaceRoot = searchForWorkspaceRoot(__dirname);
  const localesDir = path.resolve(workspaceRoot, "locales");

  const apiProxyTarget = env.VITE_API_PROXY_TARGET || "http://127.0.0.1:8000";
  const enableProxy = !env.VITE_API_BASE_URL; // when baseUrl is empty, we expect same-origin/proxy

  const appName = "admin";
  const appVersion = process.env.npm_package_version || undefined;
  const isDevServer = command === "serve" && mode === "development";
  const isBuild = command === "build";

  const plugins = [
    injectPreferences({
      storageKeys: {
        themeMode: "celestial:admin:theme",
        locale: "celestial:admin:locale",
      },
    }),
    injectLoadingScreen({
      appName: "Celestial",
    }),
    injectAppConfig({
      defaults: {
        title: env.VITE_APP_TITLE || "Celestial",
        apiBaseUrl: env.VITE_API_BASE_URL || "",
        apiPrefix: env.VITE_API_PREFIX || "/api/v1",
      },
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

  // Keep dev-only tooling at the end so any HTML transforms from earlier plugins can't override it.
  if (isDevServer) {
    plugins.push(...celestialReactInspector());
  }

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
      // In SaaS dev mode, Traefik runs inside Docker and proxies to the host machine.
      // The host services must bind to 0.0.0.0 so the Traefik container can reach them.
      host: enableProxy ? "127.0.0.1" : "0.0.0.0",
      port: 5173,
      strictPort: true,
      hmr: enableProxy ? undefined : { port: 5173, clientPort: 80 },
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
