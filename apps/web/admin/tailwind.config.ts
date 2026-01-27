import type { Config } from "tailwindcss";

import preset from "@celestial/ui-theme";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  presets: [preset],
  theme: {
    extend: {
      // Semantic font sizes aligned with the admin typography scale.
      fontSize: {
        span: ["15px", { lineHeight: "22px" }],
        p: ["18px", { lineHeight: "28px" }],
        h1: ["32px", { lineHeight: "40px" }],
      },
    },
  },
  plugins: [],
} satisfies Config;
