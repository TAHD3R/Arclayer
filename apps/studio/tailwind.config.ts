import type { Config } from "tailwindcss";

import preset from "@celestial/theme";

export default {
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
    "../../packages/ui/**/*.{ts,tsx}",
    "../../packages/ui/**/src/**/*.{ts,tsx}",
  ],
  presets: [preset],
  plugins: [],
} satisfies Config;
