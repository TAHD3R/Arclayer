import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { GeneralSettingsView } from "@/views/settings/general/GeneralSettingsView";
import type { GeneralSettingsTabKey } from "@/views/settings/general/types";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";

export const Route = createFileRoute("/w/$workspaceId/settings/general/")({
  validateSearch: (search: Record<string, unknown>): { index?: GeneralSettingsTabKey } => {
    const indexRaw = typeof search.index === "string" ? search.index : undefined;
    if (indexRaw === "localization" || indexRaw === "storage") return { index: indexRaw };
    // 默认 Tab（site）不落在 URL 里，保持链接更干净。
    return {};
  },
  component: GeneralSettingsRoutePage,
});

function GeneralSettingsRoutePage() {
  const navigate = useNavigate();
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const { index } = Route.useSearch();
  const tab: GeneralSettingsTabKey = index ?? "site";

  useEffect(() => {
    // 如果用户传了无效/冗余的 index（例如 index=site 或乱填），validateSearch 会丢弃；
    // 此时顺手清理 URL，避免“看起来像生效但其实没生效”的困惑。
    const params = new URLSearchParams(window.location.search);
    const rawIndex = params.get("index");
    if (rawIndex && !index) {
      if (workspaceId) {
        void navigate({ to: `/w/${workspaceId}/settings/general`, search: {}, replace: true });
      }
    }
  }, [index, navigate, workspaceId]);

  return (
    <GeneralSettingsView
      tab={tab}
      onTabChange={(next) => {
        if (!workspaceId) return;
        void navigate({
          to: `/w/${workspaceId}/settings/general`,
          search: next === "site" ? {} : { index: next },
        });
      }}
    />
  );
}
