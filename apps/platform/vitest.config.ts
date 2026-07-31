import path from "node:path";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { staticAppConfig } from "@arclayer/vite-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    "import.meta.env.VITE_PRODUCT_APP_ORIGIN": JSON.stringify("https://app.arclayer.localhost"),
  },
  plugins: [
    staticAppConfig({
      config: {
        title: "Arclayer Platform Console",
        apiBaseUrl: "",
        apiPrefix: "/platform-api/v1",
      },
      description: "Arclayer Platform Console",
    }),
    tanstackRouter({
      target: "react",
      autoCodeSplitting: false,
      routesDirectory: "./src/routes",
      generatedRouteTree: "./src/routeTree.gen.ts",
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@locales": path.resolve(__dirname, "./locales"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: [path.resolve(__dirname, "./test/setup.ts")],
    include: ["test/**/*.test.{ts,tsx}"],
  },
});
