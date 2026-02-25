import type { Config } from "tailwindcss";

import preset from "@celestial/ui-theme";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  presets: [preset],
  plugins: [],
} satisfies Config;
