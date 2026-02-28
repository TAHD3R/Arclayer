import { defineConfig, loadEnv, searchForWorkspaceRoot } from "vite";
import path from "path";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

import { compression } from "vite-plugin-compression2";
import ReactInspector from "vite-plugin-react-inspector";

import {
  archiveBuildOutput,
  injectAppConfig,
  injectBuildMeta,
  injectCopyrightBanner,
  injectLoadingScreen,
  injectPreferences,
} from "@celestial/vite";

function reactInspectorTypeArgumentsFix() {
  return {
    name: "celestial-react-inspector-type-arguments-fix",
    apply: "serve",
    enforce: "pre",
    transform(code: string, id: string) {
      if (!id.endsWith(".tsx") && !id.endsWith(".jsx")) return;
      if (!code.includes("data-react-inspector")) return;

      let out = "";
      let lastIndex = 0;
      let cursor = 0;

      while (true) {
        const attrStart = code.indexOf(' data-react-inspector="', cursor);
        if (attrStart === -1) break;

        const tagStart = code.lastIndexOf("<", attrStart);
        if (tagStart === -1) {
          cursor = attrStart + 1;
          continue;
        }

        let nameEnd = tagStart + 1;
        while (nameEnd < code.length) {
          const ch = code[nameEnd];
          if (
            ch === " " ||
            ch === "\n" ||
            ch === "\t" ||
            ch === "\r" ||
            ch === ">" ||
            ch === "/" ||
            ch === "<"
          ) {
            break;
          }
          nameEnd += 1;
        }

        if (nameEnd !== attrStart) {
          cursor = attrStart + 1;
          continue;
        }

        const valueStart = attrStart + ' data-react-inspector="'.length;
        const valueEndQuote = code.indexOf('"', valueStart);
        if (valueEndQuote === -1) {
          cursor = attrStart + 1;
          continue;
        }

        const afterQuote = valueEndQuote + 1;
        if (code[afterQuote] !== "<") {
          cursor = afterQuote;
          continue;
        }

        const typeEnd = findMatchingAngleBracketEnd(code, afterQuote);
        if (typeEnd === -1) {
          cursor = afterQuote + 1;
          continue;
        }

        const attrText = code.slice(attrStart, valueEndQuote + 1);
        out += code.slice(lastIndex, attrStart);
        out += code.slice(afterQuote, typeEnd + 1);
        out += attrText;

        lastIndex = typeEnd + 1;
        cursor = lastIndex;
      }

      if (!out) return;
      out += code.slice(lastIndex);
      return out;
    },
  } as const;
}

function findMatchingAngleBracketEnd(code: string, start: number): number {
  if (code[start] !== "<") return -1;

  let depth = 0;
  let inString: "'" | '"' | null = null;

  for (let i = start; i < code.length; i += 1) {
    const ch = code[i];

    if (inString) {
      if (ch === "\\") {
        i += 1;
        continue;
      }
      if (ch === inString) {
        inString = null;
      }
      continue;
    }

    if (ch === "'" || ch === '"') {
      inString = ch;
      continue;
    }

    if (ch === "<") {
      depth += 1;
      continue;
    }

    if (ch === ">") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }

  return -1;
}

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

  return {
    plugins: [
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
      ...(isDevServer ? [ReactInspector(), reactInspectorTypeArgumentsFix()] : []),
      tanstackRouter({
        target: "react",
        autoCodeSplitting: false,
        routesDirectory: "./src/routes",
        generatedRouteTree: "./src/routeTree.gen.ts",
      }),
      react(),
      tailwindcss(),
      ...(isBuild ? [injectBuildMeta({ appName, version: appVersion })] : []),
      ...(isBuild ? [injectCopyrightBanner({ appName, version: appVersion })] : []),
      ...(isBuild
        ? [
            compression({
              algorithms: ["gzip", "brotliCompress"],
              threshold: 1024,
            }),
          ]
        : []),
      ...(isBuild ? [archiveBuildOutput({ appName, version: appVersion })] : []),
    ].filter(Boolean),

    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@locales": localesDir,
      },
    },
    server: {
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
