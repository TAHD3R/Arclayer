import { useMemo } from "react";

import { createAntdTheme } from "@celestial/ui-theme/antd";
import { usePreferencesStore } from "@/stores/use-preference-store";

export function useAntdTheme() {
  const mode = usePreferencesStore((s) => s.themeMode);
  return useMemo(
    () =>
      createAntdTheme({
        mode,
        token: {
          // Typography baseline: span/text 15px, paragraph 18px (via CSS), H1 32px.
          fontSize: 16,
          fontSizeLG: 18,
          fontSizeHeading1: 32,
        },
        components: {
          Button: {
            fontWeight: 500,
            paddingInline: 14,
            controlHeight: 40,
            controlHeightLG: 44,
            controlHeightSM: 28,
            paddingInlineLG: 19,
          },
          Select: {
            controlHeight: 40,
          },
          DatePicker: {
            controlHeight: 40,
          },
        },
      }),
    [mode],
  );
}
