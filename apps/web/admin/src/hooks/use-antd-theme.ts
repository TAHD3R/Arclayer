import { useMemo } from "react";

import { createAntdTheme } from "@celestial/design-tokens/antd";
import { usePreferencesStore } from "@/stores/use-preference-store";

export function useAntdTheme() {
  const mode = usePreferencesStore((s) => s.themeMode);
  return useMemo(
    () =>
      createAntdTheme({
        mode,
        token: {
          fontSize: 16,
          fontSizeSM: 13,
          fontSizeLG: 16,
          fontSizeHeading1: 34,
          fontSizeHeading2: 28,
          fontSizeHeading3: 22,
        },
        components: {
          Button: {
            fontWeight: 600,
          },
          Input: {
            inputFontSize: 16,
            inputFontSizeLG: 16,
            inputFontSizeSM: 13,
          },
          InputNumber: {
            inputFontSize: 16,
            inputFontSizeLG: 16,
            inputFontSizeSM: 13,
          },
          Select: {
            optionFontSize: 16,
          },
        },
      }),
    [mode],
  );
}
