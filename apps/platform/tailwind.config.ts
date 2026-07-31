import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Config } from "tailwindcss";

import preset from "@arclayer/ui/tailwind-preset";

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
