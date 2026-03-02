import { useMemo } from "react";

import type { ViewerContext } from "@celestial/site-block-protocol";

import { usePreferencesStore } from "@/stores/use-preference-store";

export function useViewerContext(): ViewerContext {
  const locale = usePreferencesStore((s) => s.locale);

  return useMemo(() => ({ locale, fallbackLocale: "en-US" }), [locale]);
}
