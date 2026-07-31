import path from "node:path";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { boneyardPlugin } from "boneyard-js/vite";
import { defineConfig, loadEnv, searchForWorkspaceRoot } from "vite";
import { compression } from "vite-plugin-compression2";

import {
  archiveBuildOutput,
  injectBuildMeta,
  injectCopyrightBanner,
  injectLoadingScreen,
  staticAppConfig,
} from "@arclayer/vite-plugin";

const DEFAULT_APP_TITLE = "Arclayer Platform Console";
const DEFAULT_PLATFORM_API_PREFIX = "/platform-api/v1";
const DEFAULT_PRODUCT_APP_ORIGIN = "https://app.arclayer.localhost";

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, __dirname, "VITE_");
  const workspaceRoot = searchForWorkspaceRoot(__dirname);
  const appTitle = env.VITE_APP_TITLE || DEFAULT_APP_TITLE;
  const productAppOrigin = env.VITE_PRODUCT_APP_ORIGIN || DEFAULT_PRODUCT_APP_ORIGIN;
  const isBuild = command === "build";
  const isBoneyardCaptureEnabled =
    command === "serve" && env.VITE_BONEYARD_CAPTURE?.trim().toLowerCase() === "true";
  const plugins = [
    injectLoadingScreen({ appName: appTitle }),
    staticAppConfig({
      config: {
        title: appTitle,
        apiBaseUrl: env.VITE_PLATFORM_API_BASE_URL || "",
        apiPrefix: env.VITE_PLATFORM_API_PREFIX || DEFAULT_PLATFORM_API_PREFIX,
      },
      description: appTitle,
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

  if (isBoneyardCaptureEnabled) {
    plugins.push(
      boneyardPlugin({
        out: "./src/bones",
        framework: "react",
        breakpoints: [375, 768, 1280],
        wait: 1200,
        debug: env.VITE_BONEYARD_DEBUG?.trim().toLowerCase() === "true",
      }),
    );
  }

  if (isBuild) {
    const version = process.env.npm_package_version || undefined;
    plugins.push(injectBuildMeta({ appName: "platform", version }));
    plugins.push(injectCopyrightBanner({ appName: "platform", version }));
    plugins.push(compression({ algorithms: ["gzip", "brotliCompress"], threshold: 1024 }));
    plugins.push(archiveBuildOutput({ appName: "platform", version }));
  }

  return {
    plugins,
    define: {
      "import.meta.env.VITE_PRODUCT_APP_ORIGIN": JSON.stringify(productAppOrigin),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@locales": path.resolve(__dirname, "./locales"),
      },
    },
    server: {
      host: "127.0.0.1",
      port: 5174,
      strictPort: true,
      fs: { allow: [workspaceRoot] },
    },
    build: {
      target: "esnext",
      minify: "esbuild",
      outDir: "dist",
    },
  };
});
