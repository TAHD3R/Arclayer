import path from "path";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { staticAppConfig } from "@arclayer/vite-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: __dirname,
  plugins: [
    staticAppConfig({
      config: {
        title: "Arclayer",
        apiBaseUrl: "",
        apiPrefix: "/api/v1",
      },
      description: "Arclayer Product Application",
    }),
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      routesDirectory: "./src/routes",
      generatedRouteTree: "./src/routeTree.gen.ts",
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Keep consistent with Vite config so i18n resource imports work in tests.
      "@locales": path.resolve(__dirname, "../../locales"),
      // Plate math side-effect imports KaTeX CSS; jsdom tests only need the module to resolve.
      "katex/dist/katex.min.css": path.resolve(__dirname, "./test/mocks/empty-style-module.ts"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: [path.resolve(__dirname, "./test/setup.ts")],
    globals: true,
    css: true,
    server: {
      deps: {
        inline: [/^@platejs\/math/, /^katex/],
      },
    },
    include: ["test/**/*.test.{ts,tsx}"],
    exclude: ["test/browser/**"],
  },
});
