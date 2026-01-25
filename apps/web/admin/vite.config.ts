import { defineConfig } from "vite";
import path from "path";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import autoalias from "vite-plugin-auto-alias";
import Inspect from "vite-plugin-inspect";
import AutoImport from "unplugin-auto-import/vite";
// https://vite.dev/config/
export default defineConfig({
  plugins: [
    autoalias(),
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      routesDirectory: "./src/routes",
      generatedRouteTree: "./src/routeTree.gen.ts",
    }),
    AutoImport({}),
    react(),
    tailwindcss(),
    Inspect(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
