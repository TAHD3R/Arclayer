import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { WorkspaceSettingsView } from "@/pages/workspaces/settings/workspace/page";
import type { WorkspaceSettingsTabKey } from "@/types/settings-workspace";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

export const Route = createFileRoute("/w/$workspaceId/settings/workspace/")({
  validateSearch: (search: Record<string, unknown>): { index?: WorkspaceSettingsTabKey } => {
    const indexRaw = typeof search.index === "string" ? search.index : undefined;
    if (
      indexRaw === "collaboration" ||
      indexRaw === "content_strategy" ||
      indexRaw === "integrations" ||
      indexRaw === "resource_processing" ||
      indexRaw === "danger"
    ) {
      return { index: indexRaw };
    }
    // 默认 Tab（basics）不落在 URL 里，保持链接更干净。
    return {};
  },
  component: WorkspaceSettingsRoutePage,
});

function WorkspaceSettingsRoutePage() {
  const navigate = useNavigate();
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const { index } = Route.useSearch();
  const tab: WorkspaceSettingsTabKey = index ?? "basics";

  useEffect(() => {
    // 清理无效/冗余的 index 参数，避免“看起来像生效但其实没生效”。
    const params = new URLSearchParams(window.location.search);
    const rawIndex = params.get("index");
    if (rawIndex && !index) {
      if (workspaceId) {
        void navigate({ to: `/w/${workspaceId}/settings/workspace`, search: {}, replace: true });
      }
    }
  }, [index, navigate, workspaceId]);

  return (
    <WorkspaceSettingsView
      tab={tab}
      onTabChange={(next) => {
        if (!workspaceId) return;
        void navigate({
          to: `/w/${workspaceId}/settings/workspace`,
          search: next === "basics" ? {} : { index: next },
        });
      }}
    />
  );
}
