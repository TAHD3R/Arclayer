import type { Config } from "tailwindcss";

import preset from "@celestial/ui-theme";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  presets: [preset],
  theme: {
    extend: {
      // Map Tailwind default text-* utilities into the custom admin typography system.
      // This keeps legacy text-xs/sm/lg/xl usage visually consistent with semantic classes.
      fontSize: {
        xs: ["12px", { lineHeight: "1.45", letterSpacing: "0.02em" }],
        sm: ["13px", { lineHeight: "1.45", letterSpacing: "0.02em" }],
        base: ["16px", { lineHeight: "1.5", letterSpacing: "0em" }],
        md: ["16px", { lineHeight: "1.5", letterSpacing: "0em" }],
        lg: ["20px", { lineHeight: "1.4", letterSpacing: "0em" }],
        xl: ["22px", { lineHeight: "1.4", letterSpacing: "0em" }],
        "2xl": ["28px", { lineHeight: "1.35", letterSpacing: "-0.01em" }],
        "3xl": ["34px", { lineHeight: "1.25", letterSpacing: "-0.015em" }],
        "4xl": ["34px", { lineHeight: "1.25", letterSpacing: "-0.015em" }],
        "5xl": ["34px", { lineHeight: "1.25", letterSpacing: "-0.015em" }],
        "6xl": ["34px", { lineHeight: "1.25", letterSpacing: "-0.015em" }],
        largetitle: ["34px", { lineHeight: "1.25", letterSpacing: "-0.015em", fontWeight: "700" }],
        title: ["28px", { lineHeight: "1.35", letterSpacing: "-0.01em", fontWeight: "600" }],
        title2: ["22px", { lineHeight: "1.4", letterSpacing: "0em", fontWeight: "500" }],
        title3: ["20px", { lineHeight: "1.4", letterSpacing: "0em", fontWeight: "500" }],
        headline: ["16px", { lineHeight: "1.4", letterSpacing: "0em", fontWeight: "600" }],
        body: ["16px", { lineHeight: "1.5", letterSpacing: "0em", fontWeight: "400" }],
        callout: ["15px", { lineHeight: "1.45", letterSpacing: "0.01em", fontWeight: "400" }],
        footnote: ["13px", { lineHeight: "1.45", letterSpacing: "0.02em", fontWeight: "400" }],
        caption: ["12px", { lineHeight: "1.45", letterSpacing: "0.02em", fontWeight: "400" }],
      },
    },
  },
  plugins: [],
} satisfies Config;
