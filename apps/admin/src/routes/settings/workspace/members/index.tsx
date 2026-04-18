import { createFileRoute } from "@tanstack/react-router";

import { WorkspaceMembersSettingsPage } from "@/pages/settings/context-settings-pages";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

type WorkspaceMembersSearch = {
  q?: string;
  memberId?: string;
};

export const Route = createFileRoute("/settings/workspace/members/")({
  staticData: { titleKey: "nav:NAV_SETTINGS_TEAM_MEMBER_LIST" },
  validateSearch: (search: Record<string, unknown>): WorkspaceMembersSearch => {
    const q = typeof search.q === "string" && search.q.trim() ? search.q.trim() : undefined;
    const memberId =
      typeof search.memberId === "string" && search.memberId.trim()
        ? search.memberId.trim()
        : undefined;
    return {
      ...(q ? { q } : {}),
      ...(memberId ? { memberId } : {}),
    };
  },
  component: RouteComponent,
});

function RouteComponent() {
  const workspaceId =
    useWorkspaceStore.getState().currentWorkspaceId ?? useWorkspaceStore.getState().lastWorkspaceId;
  if (!workspaceId) {
    throw new Error("WORKSPACE_NOT_SELECTED");
  }
  const search = Route.useSearch();
  return (
    <WorkspaceMembersSettingsPage
      workspaceId={workspaceId}
      initialSearchQuery={search.q}
      initialInspectMemberId={search.memberId}
    />
  );
}
