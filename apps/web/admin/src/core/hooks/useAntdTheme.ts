import { useMemo } from "react";

import { createAntdTheme } from "@celestial/ui-theme/antd";
import { usePreferencesStore } from "@/stores/preferences.store";

export function useAntdTheme() {
  const mode = usePreferencesStore((s) => s.themeMode);
  return useMemo(() => createAntdTheme({ mode, token: { fontSize: 16 } }), [mode]);
}
