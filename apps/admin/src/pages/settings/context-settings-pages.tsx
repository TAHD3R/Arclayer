import { useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { listProjectMembers, updateProjectMemberRole } from "@/api/project-members";
import { SETTINGS_WORKSPACE_NAV_ITEMS } from "@/constants/menu/settings";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { GeneralSiteSettingsPage } from "@/pages/workspaces/settings/site/basics/page";
import { GeneralLocalizationSettingsPage } from "@/pages/workspaces/settings/site/localization/page";
import { WorkspaceSettingsBasicsView } from "@/pages/workspaces/settings/workspace/basics/components/workspace-settings-basics-view";
import { TeamInvitationsPage } from "@/pages/workspaces/team/invitations/page";
import { TeamMembersView } from "@/pages/workspaces/team/members/components/team-members-view";
import { TeamRolesPage } from "@/pages/workspaces/team/roles/page";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import type { ProjectMemberRole } from "@/types/api";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";

import { ContextSettingsShell } from "./context-settings-shell";

export function WorkspaceGeneralSettingsPage(props: { workspaceId: string }) {
  const { t } = useTranslation("settings");
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
    structuralSharing: true,
  });

  return (
    <ContextSettingsShell
      title={t("SETTINGS_WORKSPACE_TITLE")}
      description={t("SETTINGS_WORKSPACE_DESC")}
      pathname={pathname}
      items={SETTINGS_WORKSPACE_NAV_ITEMS}
    >
      <WorkspaceSettingsBasicsView workspaceId={props.workspaceId} embedded />
    </ContextSettingsShell>
  );
}

export function WorkspaceMembersSettingsPage(props: {
  workspaceId: string;
  initialSearchQuery?: string;
  initialInspectMemberId?: string;
}) {
  const { t } = useTranslation("settings");
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
    structuralSharing: true,
  });

  return (
    <ContextSettingsShell
      title={t("SETTINGS_WORKSPACE_TITLE")}
      description={t("SETTINGS_WORKSPACE_DESC")}
      pathname={pathname}
      items={SETTINGS_WORKSPACE_NAV_ITEMS}
    >
      <TeamMembersView
        workspaceIdOverride={props.workspaceId}
        initialSearchQuery={props.initialSearchQuery}
        initialInspectMemberId={props.initialInspectMemberId}
      />
    </ContextSettingsShell>
  );
}

export function WorkspaceInvitationsSettingsPage(props: { workspaceId: string }) {
  const { t } = useTranslation("settings");
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
    structuralSharing: true,
  });

  return (
    <ContextSettingsShell
      title={t("SETTINGS_WORKSPACE_TITLE")}
      description={t("SETTINGS_WORKSPACE_DESC")}
      pathname={pathname}
      items={SETTINGS_WORKSPACE_NAV_ITEMS}
    >
      <TeamInvitationsPage workspaceIdOverride={props.workspaceId} />
    </ContextSettingsShell>
  );
}

export function WorkspaceRolesSettingsPage(props: { workspaceId: string }) {
  const { t } = useTranslation("settings");
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
    structuralSharing: true,
  });

  return (
    <ContextSettingsShell
      title={t("SETTINGS_WORKSPACE_TITLE")}
      description={t("SETTINGS_WORKSPACE_DESC")}
      pathname={pathname}
      items={SETTINGS_WORKSPACE_NAV_ITEMS}
    >
      <TeamRolesPage workspaceIdOverride={props.workspaceId} />
    </ContextSettingsShell>
  );
}

export function ProjectGeneralSettingsPage() {
  const workspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
  return <GeneralSiteSettingsPage workspaceId={workspaceId} />;
}

export function ProjectLocalizationSettingsPage() {
  const workspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
  return <GeneralLocalizationSettingsPage workspaceId={workspaceId} />;
}

export function ProjectMembersSettingsPage(props: { projectId: string }) {
  const { t } = useTranslation(["account", "common"]);
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState("");

  const membersQuery = useQuery({
    queryKey: ["project", "members", props.projectId, searchInput],
    queryFn: async () =>
      listProjectMembers(props.projectId, {
        q: searchInput.trim() || undefined,
      }),
    retry: false,
    staleTime: 30 * 1000,
    meta: { silent: true },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async (payload: { membershipId: string; role: ProjectMemberRole }) =>
      updateProjectMemberRole(props.projectId, payload.membershipId, { role: payload.role }),
    onSuccess: async () => {
      notifySuccessText(t("common:SETTINGS_SAVED"));
      await queryClient.invalidateQueries({
        queryKey: ["project", "members", props.projectId],
        exact: false,
      });
    },
    onError: (error) => notifyError(error),
  });

  return (
    <DefaultPage
      title={t("account:SETTINGS_NAV_PROJECT_MEMBERS")}
      description={t("account:SETTINGS_PROJECT_MEMBERS_DESC")}
      showFavoriteToggle={false}
      pageFrame="full"
      largeViewportGutters={false}
      className="min-h-full"
      contentClassName="min-h-full"
      contentContainerClassName="min-h-full"
      action={
        <div className="flex w-full max-w-sm items-center gap-3">
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder={t("account:SETTINGS_PROJECT_MEMBERS_SEARCH_PLACEHOLDER")}
          />
        </div>
      }
    >
      <div className="overflow-hidden rounded-[16px] border border-border/70 bg-background">
        <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(10rem,0.7fr)_minmax(9rem,0.6fr)] gap-4 border-b border-border/70 px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-label-tertiary">
          <span>{t("account:SETTINGS_PROJECT_MEMBERS_COL_MEMBER")}</span>
          <span>{t("account:SETTINGS_PROJECT_MEMBERS_COL_STATUS")}</span>
          <span>{t("account:SETTINGS_PROJECT_MEMBERS_COL_ROLE")}</span>
        </div>

        {membersQuery.isLoading ? (
          <div className="px-5 py-8 text-sm text-label-secondary">{t("common:LOADING")}</div>
        ) : membersQuery.isError ? (
          <div className="flex items-center justify-between gap-4 px-5 py-8">
            <div className="text-sm text-label-secondary">{t("common:REQUEST_FAILED")}</div>
            <Button variant="outline" onClick={() => void membersQuery.refetch()}>
              {t("common:RETRY")}
            </Button>
          </div>
        ) : (membersQuery.data?.items.length ?? 0) === 0 ? (
          <div className="px-5 py-10 text-sm text-label-secondary">
            {t("account:SETTINGS_PROJECT_MEMBERS_EMPTY")}
          </div>
        ) : (
          <div className="divide-y divide-border/70">
            {(membersQuery.data?.items ?? []).map((member) => {
              const label = member.displayName || member.username || member.email || member.userId;
              return (
                <div
                  key={member.id}
                  className="grid grid-cols-[minmax(0,1.4fr)_minmax(10rem,0.7fr)_minmax(9rem,0.6fr)] gap-4 px-5 py-4"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-label-primary">{label}</div>
                    <div className="truncate text-sm text-label-secondary">
                      {member.email || member.username}
                    </div>
                  </div>
                  <div className="self-center text-sm text-label-secondary">
                    {member.userStatus}
                  </div>
                  <div className="self-center">
                    <Select
                      value={member.role}
                      onValueChange={(value) => {
                        void updateRoleMutation.mutateAsync({
                          membershipId: member.id,
                          role: value as ProjectMemberRole,
                        });
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="owner">
                          {t("account:SETTINGS_PROJECT_ROLE_OWNER")}
                        </SelectItem>
                        <SelectItem value="editor">
                          {t("account:SETTINGS_PROJECT_ROLE_EDITOR")}
                        </SelectItem>
                        <SelectItem value="viewer">
                          {t("account:SETTINGS_PROJECT_ROLE_VIEWER")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DefaultPage>
  );
}

function ProjectStandalonePage(props: { titleKey: string; descriptionKey?: string }) {
  const { t } = useTranslation(["account", "common"]);

  return (
    <DefaultPage
      title={t(props.titleKey)}
      description={t(props.descriptionKey ?? "common:PAGE_COMING_SOON_DESC")}
      showFavoriteToggle={false}
      pageFrame="full"
      largeViewportGutters={false}
      className="min-h-full"
      contentClassName="min-h-full"
      contentContainerClassName="min-h-full"
    />
  );
}

export function ProjectDomainSettingsPage() {
  return <ProjectStandalonePage titleKey="account:SETTINGS_NAV_PROJECT_DOMAIN" />;
}

export function ProjectSeoSettingsPage() {
  return <ProjectStandalonePage titleKey="account:SETTINGS_NAV_PROJECT_SEO" />;
}

export function ProjectApiKeysSettingsPage() {
  return <ProjectStandalonePage titleKey="account:SETTINGS_NAV_PROJECT_API_KEYS" />;
}

export function ProjectRuntimeSettingsPage() {
  return <ProjectStandalonePage titleKey="account:SETTINGS_NAV_PROJECT_RUNTIME" />;
}
