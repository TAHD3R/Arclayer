import { useMemo } from "react";

import { useWorkspaceCoreSettings } from "@/hooks/use-workspace-core-settings";
import type { AppLocale } from "@/lib/i18n";
import { pickString } from "@/lib/settings/general/utils";

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
