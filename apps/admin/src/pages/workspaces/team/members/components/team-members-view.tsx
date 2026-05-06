import { MoreVertical, Plus, UserCheck, UserCog, UserX } from "lucide-react";
import * as React from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import * as authApi from "@/api/auth";
import { listWorkspaceRoles } from "@/api/rbac";
import { SettingsSectionAnchor } from "@/components/layout/settings-screen-provider";
import { DataTableInfiniteScrollFooter } from "@/components/common/data-table-infinite-scroll-footer";
import { DataTableSearchInput } from "@/components/common/data-table-search-input";
import { useAdminDateTimeFormatter } from "@/hooks/use-admin-date-time-formatter";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { EditMemberRolesDialog } from "@/pages/workspaces/team/shared/components/edit-member-roles-dialog";
import { InviteMembersDialog } from "@/pages/workspaces/team/shared/components/invite-members-dialog";
import { MemberIdentityCell } from "@/pages/workspaces/team/shared/components/member-identity-cell";
import { SettingsTableRefreshSkeleton } from "@/pages/workspaces/team/shared/components/settings-table-refresh-skeleton";
import {
  DEFAULT_TEAM_MEMBER_PAGE_SIZE,
  DEFAULT_TEAM_MEMBER_SORT,
} from "@/pages/workspaces/team/shared/constants";
import type { TeamMemberSort } from "@/pages/workspaces/team/shared/types";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import type { PageData, TeamMember } from "@arclayer/openapi/admin-types";
import { TeamMembershipStatusTag, TeamRoleTag, TeamUserStatusTag } from "@/components/ui/tags";
import {
  disableTeamMember,
  enableTeamMember,
  listTeamMembers,
  setTeamMemberRoles,
} from "@/api/team";
import { listMyWorkspaces } from "@/api/workspaces";
import { Button } from "@arclayer/ui/button";
import {
  DropdownMenuContent,
  DropdownMenuIconItem,
  DropdownMenuSeparator,
  DropdownMenu,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { resolveWorkspaceName } from "../utils";

function teamMembersSettingsQueryKeyPrefix(workspaceId: string | null | undefined) {
  return ["team-members-settings", workspaceId ? String(workspaceId) : null] as const;
}

export function TeamMembersView(props: {
  workspaceIdOverride?: string | null;
  initialSearchQuery?: string;
  initialInspectMemberId?: string;
  inviteOpen?: boolean;
  onInviteOpenChange?: (open: boolean) => void;
  embedded?: boolean;
}) {
  const { t } = useTranslation(["team", "common"]);

  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  const sessionVersion = useAuthStore((s) => s.sessionVersion);
  const workspaceIdFromStore = useWorkspaceStore((s) => s.currentWorkspaceId);
  const workspaceId = props.workspaceIdOverride ?? workspaceIdFromStore;
  const [sort, setSort] = React.useState<TeamMemberSort>(DEFAULT_TEAM_MEMBER_SORT);
  const [searchInput, setSearchInput] = React.useState("");

  const [uncontrolledInviteOpen, setUncontrolledInviteOpen] = React.useState(false);
  const inviteOpen = props.inviteOpen ?? uncontrolledInviteOpen;
  const setInviteOpen = props.onInviteOpenChange ?? setUncontrolledInviteOpen;

  const meQuery = useQuery({
    queryKey: ["auth", "me", sessionVersion],
    enabled: Boolean(accessToken),
    queryFn: async () => authApi.me(),
    staleTime: 60 * 1000,
    retry: false,
    meta: { silent: true },
  });
  const currentUserId = meQuery.data?.id ?? null;

  const workspacesQuery = useQuery({
    queryKey: ["me", "workspaces", sessionVersion],
    enabled: Boolean(accessToken),
    queryFn: async () => listMyWorkspaces(),
    staleTime: 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const workspaceName = React.useMemo(
    () =>
      resolveWorkspaceName(
        workspacesQuery.data?.items,
        workspaceId ? String(workspaceId) : null,
        t("team:TEAM_WORKSPACE_FALLBACK"),
      ),
    [t, workspaceId, workspacesQuery.data?.items],
  );

  const rolesQuery = useQuery({
    queryKey: ["rbac", "roles", "list", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => listWorkspaceRoles(String(workspaceId), { size: 200 }),
    staleTime: 60 * 1000,
    retry: false,
    meta: { silent: true },
  });
  const rolesQueryFailed = rolesQuery.isError;

  const roleNameByCode = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rolesQuery.data?.items ?? []) {
      map.set(r.code, r.name || r.code);
    }
    return map;
  }, [rolesQuery.data?.items]);

  const [editingMember, setEditingMember] = React.useState<TeamMember | null>(null);
  const [editingRoleCode, setEditingRoleCode] = React.useState<string | null>(null);
  const hydratedSearchRef = React.useRef<string | null>(null);
  const canEditRoles = Boolean(editingMember) && editingMember?.membershipStatus === "active";
  const membersSettingsQueryKeyPrefix = teamMembersSettingsQueryKeyPrefix(workspaceId);

  const invalidateMembersQuery = React.useCallback(() => {
    return queryClient.invalidateQueries({
      queryKey: membersSettingsQueryKeyPrefix,
      exact: false,
    });
  }, [membersSettingsQueryKeyPrefix, queryClient]);

  const enableMutation = useMutation({
    mutationFn: async (membershipId: string) => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      return enableTeamMember(String(workspaceId), membershipId);
    },
    onSuccess: () => {
      notifySuccessText(t("team:TEAM_ACTION_SUCCESS"));
      void invalidateMembersQuery();
    },
    onError: (err) => notifyError(err),
  });

  const disableMutation = useMutation({
    mutationFn: async (membershipId: string) => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      return disableTeamMember(String(workspaceId), membershipId);
    },
    onSuccess: () => {
      notifySuccessText(t("team:TEAM_ACTION_SUCCESS"));
      void invalidateMembersQuery();
    },
    onError: (err) => notifyError(err),
  });

  const updateRolesMutation = useMutation({
    mutationFn: async (payload: { membershipId: string; roleCodes: string[] }) =>
      workspaceId
        ? setTeamMemberRoles(String(workspaceId), payload.membershipId, {
            roleCodes: payload.roleCodes,
          })
        : Promise.reject(new Error("WORKSPACE_NOT_SELECTED")),
    onSuccess: () => {
      notifySuccessText(t("team:TEAM_ACTION_SUCCESS"));
      void invalidateMembersQuery();
      setEditingMember(null);
      setEditingRoleCode(null);
    },
    onError: (err) => notifyError(err),
  });

  const dateTime = useAdminDateTimeFormatter();
  const membersQuery = useInfiniteQuery<PageData<TeamMember>>({
    queryKey: [...membersSettingsQueryKeyPrefix, searchInput, sort],
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.next ?? undefined,
    queryFn: async ({ pageParam }) => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      return listTeamMembers(String(workspaceId), {
        page: typeof pageParam === "number" ? pageParam : 1,
        size: DEFAULT_TEAM_MEMBER_PAGE_SIZE,
        q: searchInput.trim() || undefined,
        ordering: sort,
      });
    },
    enabled: Boolean(workspaceId),
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });
  const rows = membersQuery.data?.pages.flatMap((page) => page.items ?? []) ?? [];

  React.useEffect(() => {
    const nextQuery = String(props.initialSearchQuery || "").trim();
    if (!nextQuery || hydratedSearchRef.current === nextQuery) return;
    hydratedSearchRef.current = nextQuery;
    setSearchInput(nextQuery);
  }, [props.initialSearchQuery]);

  const renderMemberActions = React.useCallback(
    (member: TeamMember) => {
      const canEnable = member.membershipStatus === "disabled";
      const canDisable = member.membershipStatus === "active";
      const isSelf = currentUserId ? String(currentUserId) === String(member.userId) : false;
      const canEditMemberRoles = member.membershipStatus === "active";

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={t("team:TEAM_USER_ACTIONS")}>
              <MoreVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuIconItem
              icon={<UserCog className="size-4" />}
              disabled={!canEditMemberRoles || rolesQueryFailed}
              onSelect={() => {
                setEditingMember(member);
                setEditingRoleCode(member.roleCodes?.[0] ?? null);
              }}
            >
              {t("team:TEAM_ACTION_EDIT_ROLES")}
            </DropdownMenuIconItem>
            <DropdownMenuSeparator />
            <DropdownMenuIconItem
              icon={<UserCheck className="size-4" />}
              disabled={!canEnable}
              onSelect={() => enableMutation.mutate(member.membershipId)}
            >
              {t("team:TEAM_ACTION_ENABLE")}
            </DropdownMenuIconItem>
            <DropdownMenuIconItem
              icon={<UserX className="size-4" />}
              disabled={!canDisable || isSelf}
              onSelect={() => {
                if (isSelf) return;
                disableMutation.mutate(member.membershipId);
              }}
            >
              {isSelf ? t("team:TEAM_ACTION_DISABLE_SELF_DISABLED") : t("team:TEAM_ACTION_DISABLE")}
            </DropdownMenuIconItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
    [currentUserId, enableMutation, disableMutation, rolesQueryFailed, t],
  );

  const pageToolbar = (
    <div className="flex flex-wrap items-center gap-3">
      <DataTableSearchInput
        value={searchInput}
        onChange={setSearchInput}
        placeholder={t("team:TEAM_SEARCH_PLACEHOLDER")}
        clearLabel={t("common:CLEAR")}
      />

      <Select value={sort} onValueChange={(next) => setSort(next as TeamMemberSort)}>
        <SelectTrigger className="w-[13rem] min-w-[13rem]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start" position="popper">
          <SelectItem value="-created_at">{t("team:TEAM_SORT_NEWEST")}</SelectItem>
          <SelectItem value="user__username">{t("team:TEAM_SORT_USERNAME_AZ")}</SelectItem>
          <SelectItem value="-user__username">{t("team:TEAM_SORT_USERNAME_ZA")}</SelectItem>
          <SelectItem value="user__email">{t("team:TEAM_SORT_EMAIL_AZ")}</SelectItem>
          <SelectItem value="-user__email">{t("team:TEAM_SORT_EMAIL_ZA")}</SelectItem>
          <SelectItem value="-user__last_login_at">
            {t("team:TEAM_SORT_LAST_LOGIN_RECENT")}
          </SelectItem>
          <SelectItem value="user__last_login_at">{t("team:TEAM_SORT_LAST_LOGIN_OLD")}</SelectItem>
          <SelectItem value="status">{t("team:TEAM_SORT_MEMBER_STATUS")}</SelectItem>
          <SelectItem value="-status">{t("team:TEAM_SORT_MEMBER_STATUS_DESC")}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  const content = (
    <>
      <ContentGuard
        loading={Boolean(membersQuery.isLoading && !membersQuery.data)}
        error={membersQuery.error}
        empty={!membersQuery.isLoading && !membersQuery.isError && rows.length === 0}
        onRetry={() => {
          void membersQuery.refetch();
        }}
        container="raw"
        loadingVariant="table"
        emptyTitle={t("team:TEAM_EMPTY_TITLE")}
        emptyDescription={t("team:TEAM_EMPTY_DESC")}
        variant="compact"
      >
        <SettingsSectionAnchor section="members-table">
          {membersQuery.isFetching &&
          !membersQuery.isLoading &&
          !membersQuery.isFetchingNextPage ? (
            <SettingsTableRefreshSkeleton />
          ) : null}
          <div className="min-w-0 overflow-x-auto">
            <table className="min-w-[62rem] w-full table-fixed border-collapse">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="w-1/4 py-2 pr-4 text-left text-callout font-semibold text-label-secondary">
                    {t("team:TEAM_TABLE_COL_USER")}
                  </th>
                  <th className="w-1/4 px-4 py-2 text-left text-callout font-semibold font-medium text-label-secondary">
                    {t("team:TEAM_TABLE_COL_ROLES")}
                  </th>
                  <th className="w-1/4 px-4 py-2 text-left text-callout font-semibold font-medium text-label-secondary">
                    {t("team:TEAM_TABLE_COL_STATUS")}
                  </th>
                  <th className="w-1/4 px-4 py-2 text-left text-callout font-semibold font-medium text-label-secondary">
                    {t("team:TEAM_TABLE_COL_LAST_LOGIN")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((member) => {
                  const roleSummary =
                    member.roleCodes.length <= 1
                      ? (roleNameByCode.get(member.roleCodes[0] ?? "") ??
                        member.roleCodes[0] ??
                        "-")
                      : t("team:TEAM_MEMBER_CONTEXT_MULTIPLE_ROLES", {
                          count: member.roleCodes.length,
                        });
                  const hoverStatusLabel =
                    member.userStatus === "active"
                      ? t("team:TEAM_USER_STATUS_ACTIVE")
                      : member.userStatus === "disabled"
                        ? t("team:TEAM_USER_STATUS_DISABLED")
                        : t("team:TEAM_USER_STATUS_LOCKED");
                  const membership = member.membershipStatus;
                  const user = member.userStatus;
                  const isNormal = membership === "active" && user === "active";
                  const formattedLastLogin = dateTime.formatDateTimeOrNull(member.lastLoginAt);

                  return (
                    <SettingsSectionAnchor
                      key={member.membershipId}
                      as="tr"
                      section="member-row"
                      payloadMatches={(payload) => payload?.memberId === member.userId}
                      className="border-b border-border/50 last:border-b-0"
                    >
                      <td className="py-4 pr-4">
                        <div className="flex items-start justify-between gap-3">
                          <MemberIdentityCell
                            member={member}
                            scopeLabel={t("team:TEAM_MEMBER_CONTEXT_SCOPE")}
                            scopeVariant="workspace"
                            badges={
                              <>
                                <TeamRoleTag
                                  className="!mr-0 max-w-full overflow-hidden"
                                  label={<span className="truncate">{roleSummary}</span>}
                                />
                                <TeamUserStatusTag
                                  status={member.userStatus}
                                  className="!mr-0 max-w-full overflow-hidden"
                                  label={<span className="truncate">{hoverStatusLabel}</span>}
                                />
                              </>
                            }
                            description={t("team:TEAM_MEMBER_CONTEXT_HOVER_SUMMARY", {
                              roleCount: member.roleCodes.length,
                            })}
                            className="min-w-0 flex-1"
                          />
                          <div className="shrink-0">{renderMemberActions(member)}</div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        {member.roleCodes.length ? (
                          <div className="flex flex-wrap gap-1">
                            {member.roleCodes.slice(0, 3).map((code: string) => (
                              <TeamRoleTag
                                key={code}
                                className="mr-0!"
                                label={roleNameByCode.get(code) ?? code}
                              />
                            ))}
                            {member.roleCodes.length > 3 ? (
                              <span className="text-caption text-label-secondary">
                                {t("team:TEAM_MORE_ROLES", { count: member.roleCodes.length - 3 })}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-label-secondary">-</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap items-center gap-1">
                          <TeamMembershipStatusTag
                            status={membership}
                            className="mr-0!"
                            label={
                              membership === "active"
                                ? t("team:TEAM_MEMBERSHIP_STATUS_ACTIVE")
                                : membership === "invited"
                                  ? t("team:TEAM_MEMBERSHIP_STATUS_INVITED")
                                  : t("team:TEAM_MEMBERSHIP_STATUS_DISABLED")
                            }
                          />
                          {!isNormal ? (
                            <TeamUserStatusTag
                              status={user}
                              className="mr-0!"
                              label={
                                user === "active"
                                  ? t("team:TEAM_USER_STATUS_ACTIVE")
                                  : user === "disabled"
                                    ? t("team:TEAM_USER_STATUS_DISABLED")
                                    : t("team:TEAM_USER_STATUS_LOCKED")
                              }
                            />
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-callout text-label-primary">
                        <span className={formattedLastLogin ? "" : "text-label-secondary"}>
                          {formattedLastLogin || t("team:TEAM_LAST_LOGIN_NEVER")}
                        </span>
                      </td>
                    </SettingsSectionAnchor>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SettingsSectionAnchor>
        {membersQuery.data && rows.length > 0 ? (
          <DataTableInfiniteScrollFooter
            hasMore={Boolean(membersQuery.hasNextPage)}
            loadingMore={membersQuery.isFetchingNextPage}
            error={membersQuery.isFetchNextPageError ? membersQuery.error : undefined}
            onLoadMore={() => {
              if (membersQuery.isFetchingNextPage || !membersQuery.hasNextPage) return;
              membersQuery.fetchNextPage().catch(() => undefined);
            }}
            loadingLabel={t("common:DATA_TABLE_LOADING_MORE")}
            errorLabel={t("common:DATA_TABLE_LOAD_MORE_ERROR")}
          />
        ) : null}
      </ContentGuard>

      <EditMemberRolesDialog
        open={Boolean(editingMember)}
        onOpenChange={(open) => {
          if (!open) {
            setEditingMember(null);
            setEditingRoleCode(null);
          }
        }}
        member={editingMember}
        roles={rolesQuery.data?.items ?? []}
        rolesLoading={rolesQuery.isLoading}
        value={editingRoleCode}
        onChange={setEditingRoleCode}
        confirmLoading={updateRolesMutation.isPending}
        confirmDisabled={!canEditRoles}
        onConfirm={() => {
          if (!editingMember) return;
          if (!canEditRoles) return;
          updateRolesMutation.mutate({
            membershipId: editingMember.membershipId,
            roleCodes: editingRoleCode ? [editingRoleCode] : [],
          });
        }}
      />

      <InviteMembersDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        mode="email"
        workspaceId={String(workspaceId || "")}
        workspaceName={workspaceName}
        roles={rolesQuery.data?.items ?? []}
        rolesLoading={rolesQuery.isLoading}
        onInvited={() => void invalidateMembersQuery()}
      />
    </>
  );

  if (props.embedded) {
    return (
      <div className="flex min-h-0 flex-col gap-4">
        {pageToolbar}
        {content}
      </div>
    );
  }

  return (
    <DefaultPage
      title={t("team:TEAM_MEMBERS_TITLE")}
      description={t("team:TEAM_MEMBERS_DESC_LONG")}
      className="h-full"
      contentClassName="min-h-0 flex flex-col"
      extra={pageToolbar}
      action={
        <Button onClick={() => setInviteOpen(true)}>
          <Plus size={16} />
          {t("team:TEAM_INVITE_MEMBER")}
        </Button>
      }
    >
      {content}
    </DefaultPage>
  );
}
