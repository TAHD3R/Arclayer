import type { Config } from "tailwindcss";
import path from "node:path";
import { fileURLToPath } from "node:url";

import preset from "@celestial/theme";

const here = path.dirname(fileURLToPath(import.meta.url));

export default {
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
    path.resolve(here, "../../packages/ui/**/*.{ts,tsx}"),
    path.resolve(here, "../../packages/ui/**/src/**/*.{ts,tsx}"),
  ],
  presets: [preset],
  plugins: [],
} satisfies Config;
