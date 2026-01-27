import { useMemo } from "react";

import { createAntdTheme } from "@celestial/ui-theme/antd";
import { usePreferencesStore } from "@/stores/usePreferenceStore";

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
      }),
    [mode],
  );
}
