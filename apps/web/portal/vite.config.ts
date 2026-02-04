import { defineConfig } from "vite";
import path from "node:path";
import react from "@vitejs/plugin-react-swc";

import vike from "vike/plugin";

export default defineConfig(() => {
  return {
    plugins: [vike(), react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
