import { defineConfig, loadEnv, searchForWorkspaceRoot } from "vite";
import path from "path";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import Inspect from "vite-plugin-inspect";

import { injectAppConfig } from "./vite/plugins/inject-app-config";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "VITE_");
  const workspaceRoot = searchForWorkspaceRoot(__dirname);
  const localesDir = path.resolve(workspaceRoot, "locales");

  const apiProxyTarget = env.VITE_API_PROXY_TARGET || "http://127.0.0.1:8000";
  const enableProxy = !env.VITE_API_BASE_URL; // when baseUrl is empty, we expect same-origin/proxy

  return {
    plugins: [
      injectAppConfig({
        defaults: {
          title: env.VITE_APP_TITLE || "Celestial Admin",
          apiBaseUrl: env.VITE_API_BASE_URL || "",
          apiPrefix: env.VITE_API_PREFIX || "/api/v1",
        },
      }),
      tanstackRouter({
        target: "react",
        autoCodeSplitting: true,
        routesDirectory: "./src/routes",
        generatedRouteTree: "./src/routeTree.gen.ts",
      }),
      react(),
      tailwindcss(),
      mode === "development" ? Inspect() : null,
    ].filter(Boolean),

    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@locales": localesDir,
      },
    },

    server: {
      // Monorepo: allow reading workspace files (e.g. root `locales/` JSON).
      // Important: setting `server.fs.allow` overrides Vite defaults, so we must include the workspace root.
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
  };
});
