import { useMemo } from "react";

import type { AppLocale } from "@/lib/i18n";
import { useWorkspaceCoreSettings } from "@/hooks/use-workspace-core-settings";

function pickString(obj: unknown, path: readonly string[]): string | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cur: any = obj;
  for (const key of path) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = cur[key];
  }
  return typeof cur === "string" ? cur : undefined;
}

export function useWorkspaceLocalization() {
  const coreQuery = useWorkspaceCoreSettings();

  const localization = useMemo(() => {
    const value = coreQuery.data?.value;
    const locale =
      (pickString(value, ["workspace_localization", "locale"]) as AppLocale | undefined) ??
      undefined;
    const timezone = pickString(value, ["workspace_localization", "timezone"]) ?? undefined;
    const dateFormat = pickString(value, ["workspace_localization", "date_format"]) ?? undefined;
    return {
      locale,
      timezone,
      dateFormat,
    } as const;
  }, [coreQuery.data?.value]);

  return {
    ...coreQuery,
    localization,
  } as const;
}
