import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: __dirname,
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@locales": path.resolve(__dirname, "../../locales"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: [],
    include: ["test/**/*.test.{ts,tsx}", "test/**/*.spec.{ts,tsx}"],
  },
});
