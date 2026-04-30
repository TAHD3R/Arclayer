"use client";

import { Link2Off, Plus, RotateCcw } from "lucide-react";
import * as React from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { listWorkspaceRoles } from "@/api/rbac";
import {
  deleteTeamInvitation,
  disableTeamInviteLink,
  listTeamInviteLinks,
  listTeamInvitations,
  renewTeamInvitation,
  renewTeamInviteLink,
} from "@/api/team";
import { listMyWorkspaces } from "@/api/workspaces";
import { SettingsSectionAnchor } from "@/components/layout/settings-screen-provider";
import { DataTableActionsCell } from "@/components/common/data-table-actions-cell";
import { DataTableInfiniteScrollFooter } from "@/components/common/data-table-infinite-scroll-footer";
import { DataTableSearchInput } from "@/components/common/data-table-search-input";
import { InvitationStatusTag } from "@/components/ui/tags";
import { useAdminDateTimeFormatter } from "@/hooks/use-admin-date-time-formatter";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import { PageExtraToolbar } from "@/layouts/page-shell/page-extra-toolbar";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { TeamInvitationsDialogs } from "@/pages/workspaces/team/invitations/components/invitations-dialogs";
import { InviteLinkParticipantsPopover } from "@/pages/workspaces/team/shared/components/invite-link-participants-popover";
import { InviteMembersDialog } from "@/pages/workspaces/team/shared/components/invite-members-dialog";
import { InvitationUserLabel } from "@/pages/workspaces/team/shared/components/invitation-user-label";
import { buildInvitationUserDetails } from "@/pages/workspaces/team/shared/components/invitation-user-details";
import { SettingsTableRefreshSkeleton } from "@/pages/workspaces/team/shared/components/settings-table-refresh-skeleton";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import type { PageData, TeamInvitation, TeamInviteLink } from "@/types/api";
import { Button } from "@arclayer/ui/button";
import {
  ChromeTabs,
  ChromeTabsContent,
  ChromeTabsList,
  ChromeTabsTrigger,
} from "@arclayer/ui/chrome-tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";

import type { RenewExpiresInSeconds, TabKey } from "../types";

type InvitationSort =
  | "email"
  | "-email"
  | "status"
  | "-status"
  | "created_at"
  | "-created_at"
  | "expires_at"
  | "-expires_at";

type InviteLinkSort =
  | "display_code"
  | "-display_code"
  | "uses_count"
  | "-uses_count"
  | "created_at"
  | "-created_at"
  | "expires_at"
  | "-expires_at";

const DEFAULT_PAGE_SIZE = 10;
const DEFAULT_PENDING_SORT: InvitationSort = "-created_at";
const DEFAULT_ACCEPTED_SORT: InvitationSort = "-created_at";
const DEFAULT_LINKS_SORT: InviteLinkSort = "-created_at";

function invitationsQueryKeyPrefix(
  workspaceId: string | null | undefined,
  tab: "pending" | "accepted",
) {
  return ["team-invitations-settings", workspaceId ? String(workspaceId) : null, tab] as const;
}

function inviteLinksQueryKeyPrefix(workspaceId: string | null | undefined) {
  return ["team-invite-links-settings", workspaceId ? String(workspaceId) : null] as const;
}

const INVITATIONS_ACTION_COLUMN_CLASSNAME =
  "sticky right-0 z-10 whitespace-nowrap bg-background/95 shadow-[-12px_0_24px_-20px_rgba(15,23,42,0.22)] backdrop-blur supports-[backdrop-filter]:bg-background/88";

export function TeamInvitationsView(
  props: {
    workspaceIdOverride?: string | null;
    inviteLinkOpen?: boolean;
    onInviteLinkOpenChange?: (open: boolean) => void;
    inviteEmailOpen?: boolean;
    onInviteEmailOpenChange?: (open: boolean) => void;
    embedded?: boolean;
  } = {},
) {
  const { t } = useTranslation(["team", "nav", "common"]);
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  const sessionVersion = useAuthStore((s) => s.sessionVersion);
  const workspaceIdFromStore = useWorkspaceStore((s) => s.currentWorkspaceId);
  const workspaceId = props.workspaceIdOverride ?? workspaceIdFromStore;
  const dateTime = useAdminDateTimeFormatter();
  const [tab, setTab] = React.useState<TabKey>("pending");

  const [pendingSearchInput, setPendingSearchInput] = React.useState("");
  const [pendingSort, setPendingSort] = React.useState<InvitationSort>(DEFAULT_PENDING_SORT);

  const [acceptedSearchInput, setAcceptedSearchInput] = React.useState("");
  const [acceptedSort, setAcceptedSort] = React.useState<InvitationSort>(DEFAULT_ACCEPTED_SORT);

  const [linksSearchInput, setLinksSearchInput] = React.useState("");
  const [linksSort, setLinksSort] = React.useState<InviteLinkSort>(DEFAULT_LINKS_SORT);

  const [uncontrolledInviteLinkOpen, setUncontrolledInviteLinkOpen] = React.useState(false);
  const [uncontrolledInviteEmailOpen, setUncontrolledInviteEmailOpen] = React.useState(false);
  const inviteOpen = props.inviteLinkOpen ?? uncontrolledInviteLinkOpen;
  const setInviteOpen = props.onInviteLinkOpenChange ?? setUncontrolledInviteLinkOpen;
  const inviteEmailOpen = props.inviteEmailOpen ?? uncontrolledInviteEmailOpen;
  const setInviteEmailOpen = props.onInviteEmailOpenChange ?? setUncontrolledInviteEmailOpen;

  const [deleteInvitation, setDeleteInvitation] = React.useState<TeamInvitation | null>(null);
  const [renewInvitation, setRenewInvitation] = React.useState<TeamInvitation | null>(null);
  const [renewLink, setRenewLink] = React.useState<TeamInviteLink | null>(null);
  const [renewExpiresInSeconds, setRenewExpiresInSeconds] = React.useState<RenewExpiresInSeconds>(
    7 * 24 * 60 * 60,
  );

  const workspacesQuery = useQuery({
    queryKey: ["me", "workspaces", sessionVersion],
    enabled: Boolean(accessToken),
    queryFn: async () => listMyWorkspaces(),
    staleTime: 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const workspaceName = React.useMemo(() => {
    const items = workspacesQuery.data?.items ?? [];
    const found = workspaceId
      ? items.find((w) => String(w.workspaceId) === String(workspaceId))
      : undefined;
    return found?.name || t("team:TEAM_WORKSPACE_FALLBACK");
  }, [t, workspaceId, workspacesQuery.data?.items]);

  const rolesQuery = useQuery({
    queryKey: ["rbac", "roles", "list", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => listWorkspaceRoles(String(workspaceId), { size: 200 }),
    staleTime: 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const roleNameByCode = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const role of rolesQuery.data?.items ?? []) {
      map.set(role.code, role.name || role.code);
    }
    return map;
  }, [rolesQuery.data?.items]);

  const pendingInvitationsKey = invitationsQueryKeyPrefix(workspaceId, "pending");
  const acceptedInvitationsKey = invitationsQueryKeyPrefix(workspaceId, "accepted");
  const inviteLinksKey = inviteLinksQueryKeyPrefix(workspaceId);

  const invalidatePendingInvitations = React.useCallback(() => {
    return queryClient.invalidateQueries({ queryKey: pendingInvitationsKey, exact: false });
  }, [pendingInvitationsKey, queryClient]);

  const invalidateInviteLinks = React.useCallback(() => {
    return queryClient.invalidateQueries({ queryKey: inviteLinksKey, exact: false });
  }, [inviteLinksKey, queryClient]);

  const disableLinkMutation = useMutation({
    mutationFn: async (linkId: string) =>
      workspaceId
        ? disableTeamInviteLink(String(workspaceId), linkId)
        : Promise.reject(new Error("WORKSPACE_NOT_SELECTED")),
    onSuccess: () => {
      notifySuccessText(t("team:TEAM_ACTION_SUCCESS"));
      void invalidateInviteLinks();
    },
    onError: (err) => notifyError(err),
  });

  const renewLinkMutation = useMutation({
    mutationFn: async (payload: { linkId: string; expiresInSeconds: number | null }) =>
      workspaceId
        ? renewTeamInviteLink(String(workspaceId), payload.linkId, {
            expiresInSeconds: payload.expiresInSeconds,
          })
        : Promise.reject(new Error("WORKSPACE_NOT_SELECTED")),
    onSuccess: () => {
      notifySuccessText(t("team:TEAM_ACTION_SUCCESS"));
      void invalidateInviteLinks();
      setRenewLink(null);
    },
    onError: (err) => notifyError(err),
  });

  const renewInvitationMutation = useMutation({
    mutationFn: async (payload: { invitationId: string; expiresInSeconds: number | null }) =>
      workspaceId
        ? renewTeamInvitation(String(workspaceId), payload.invitationId, {
            expiresInSeconds: payload.expiresInSeconds,
          })
        : Promise.reject(new Error("WORKSPACE_NOT_SELECTED")),
    onSuccess: () => {
      notifySuccessText(t("team:TEAM_ACTION_SUCCESS"));
      void invalidatePendingInvitations();
      setRenewInvitation(null);
    },
    onError: (err) => notifyError(err),
  });

  const deleteInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) =>
      workspaceId
        ? deleteTeamInvitation(String(workspaceId), invitationId)
        : Promise.reject(new Error("WORKSPACE_NOT_SELECTED")),
    onSuccess: () => {
      notifySuccessText(t("team:TEAM_ACTION_SUCCESS"));
      void invalidatePendingInvitations();
    },
    onError: (err) => notifyError(err),
  });

  const pendingInvitationsQuery = useInfiniteQuery<PageData<TeamInvitation>>({
    queryKey: [...pendingInvitationsKey, pendingSearchInput, pendingSort],
    enabled: Boolean(workspaceId) && tab === "pending",
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.next ?? undefined,
    queryFn: async ({ pageParam }) => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      return listTeamInvitations(String(workspaceId), {
        page: typeof pageParam === "number" ? pageParam : 1,
        size: DEFAULT_PAGE_SIZE,
        q: pendingSearchInput.trim() || undefined,
        ordering: pendingSort,
        status: "pending",
        mine: true,
      });
    },
    staleTime: 20 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const acceptedInvitationsQuery = useInfiniteQuery<PageData<TeamInvitation>>({
    queryKey: [...acceptedInvitationsKey, acceptedSearchInput, acceptedSort],
    enabled: Boolean(workspaceId) && tab === "accepted",
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.next ?? undefined,
    queryFn: async ({ pageParam }) => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      return listTeamInvitations(String(workspaceId), {
        page: typeof pageParam === "number" ? pageParam : 1,
        size: DEFAULT_PAGE_SIZE,
        q: acceptedSearchInput.trim() || undefined,
        ordering: acceptedSort,
        status: "accepted",
        mine: true,
      });
    },
    staleTime: 20 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const inviteLinksQuery = useInfiniteQuery<PageData<TeamInviteLink>>({
    queryKey: [...inviteLinksKey, linksSearchInput, linksSort],
    enabled: Boolean(workspaceId) && tab === "links",
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.next ?? undefined,
    queryFn: async ({ pageParam }) => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      const data = await listTeamInviteLinks(String(workspaceId), {
        page: typeof pageParam === "number" ? pageParam : 1,
        size: DEFAULT_PAGE_SIZE,
        q: linksSearchInput.trim() || undefined,
        ordering: linksSort,
        mine: true,
      });
      return {
        ...data,
        items: (data.items ?? []).filter((item) => !item.disabledAt),
      };
    },
    staleTime: 20 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const pendingInvitationRows =
    pendingInvitationsQuery.data?.pages.flatMap((page) => page.items ?? []) ?? [];
  const acceptedInvitationRows =
    acceptedInvitationsQuery.data?.pages.flatMap((page) => page.items ?? []) ?? [];
  const inviteLinkRows = inviteLinksQuery.data?.pages.flatMap((page) => page.items ?? []) ?? [];

  const renderLoadMoreFooter = React.useCallback(
    (query: {
      data: unknown;
      hasNextPage: boolean;
      isFetchingNextPage: boolean;
      isFetchNextPageError: boolean;
      error: unknown;
      fetchNextPage: () => Promise<unknown>;
    }) => (
      <DataTableInfiniteScrollFooter
        hasMore={Boolean(query.hasNextPage)}
        loadingMore={query.isFetchingNextPage}
        error={query.isFetchNextPageError ? query.error : undefined}
        onLoadMore={() => {
          if (query.isFetchingNextPage || !query.hasNextPage) return;
          query.fetchNextPage().catch(() => undefined);
        }}
        loadingLabel={t("common:DATA_TABLE_LOADING_MORE")}
        errorLabel={t("common:DATA_TABLE_LOAD_MORE_ERROR")}
      />
    ),
    [t],
  );

  const renderInvitationStatus = React.useCallback(
    (status: TeamInvitation["status"] | null | undefined): string => {
      if (status === "pending") return t("team:TEAM_INVITATION_STATUS_PENDING");
      if (status === "accepted") return t("team:TEAM_INVITATION_STATUS_ACCEPTED");
      if (status === "revoked") return t("team:TEAM_INVITATION_STATUS_REVOKED");
      if (status === "expired") return t("team:TEAM_INVITATION_STATUS_EXPIRED");
      return t("common:NA");
    },
    [t],
  );

  const renewOptions = React.useMemo<Array<{ label: string; value: RenewExpiresInSeconds }>>(
    () => [
      { label: t("team:TEAM_INVITE_LINK_EXPIRES_1_DAY"), value: 1 * 24 * 60 * 60 },
      { label: t("team:TEAM_INVITE_LINK_EXPIRES_7_DAYS"), value: 7 * 24 * 60 * 60 },
      { label: t("team:TEAM_INVITE_LINK_EXPIRES_30_DAYS"), value: 30 * 24 * 60 * 60 },
      { label: t("team:TEAM_INVITE_LINK_EXPIRES_NEVER"), value: null },
    ],
    [t],
  );

  const tabs = [
    { value: "pending" as const, label: t("team:TEAM_INVITATIONS_TAB_PENDING") },
    { value: "accepted" as const, label: t("team:TEAM_INVITATIONS_TAB_ACCEPTED") },
    { value: "links" as const, label: t("team:TEAM_INVITATIONS_TAB_LINKS") },
  ];

  const renderPendingRow = React.useCallback(
    (invitation: TeamInvitation) => {
      const roleName = invitation.roleCode
        ? (roleNameByCode.get(invitation.roleCode) ?? invitation.roleCode)
        : null;
      const status = invitation.status;
      const createdAt = dateTime.formatDateTimeOrNull(invitation.createdAt);
      const expiresAt = dateTime.formatDateTimeOrNull(invitation.expiresAt);

      return (
        <SettingsSectionAnchor
          key={invitation.id}
          as="tr"
          section="pending-invitations"
          className="border-b border-border/50 last:border-b-0"
        >
          <td className="py-4 pr-4">
            <div className="flex min-w-0 items-baseline justify-between gap-3">
              <div className="truncate font-medium text-label-primary">
                {invitation.email || "-"}
              </div>
              <div className="shrink-0 text-callout text-label-secondary">
                {roleName || t("common:NA")}
              </div>
            </div>
          </td>
          <td className="px-4 py-4">
            <InvitationUserLabel
              user={invitation.createdBy}
              roleLabel={roleName}
              status={status}
              statusLabel={renderInvitationStatus(status)}
              details={buildInvitationUserDetails({
                t,
                dateTime,
                inviteeEmail: invitation.email,
                createdAt: invitation.createdAt,
                expiresAt: invitation.expiresAt,
              })}
            />
          </td>
          <td className="px-4 py-4">
            <InvitationStatusTag status={status} label={renderInvitationStatus(status)} />
          </td>
          <td className="px-4 py-4 text-callout text-label-primary">
            <span className={createdAt ? "" : "text-label-secondary"}>{createdAt || "-"}</span>
          </td>
          <td className="px-4 py-4 text-callout text-label-primary">
            <span className={expiresAt ? "" : "text-label-secondary"}>
              {expiresAt || t("team:TEAM_INVITATIONS_NEVER_EXPIRES")}
            </span>
          </td>
          <td className={`py-4 pl-4 ${INVITATIONS_ACTION_COLUMN_CLASSNAME}`}>
            <DataTableActionsCell>
              <Button
                variant="ghost"
                size="sm"
                disabled={status !== "pending"}
                onClick={() => {
                  setRenewExpiresInSeconds(7 * 24 * 60 * 60);
                  setRenewInvitation(invitation);
                }}
              >
                <RotateCcw className="size-4" />
                {t("team:TEAM_ACTION_RENEW")}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setDeleteInvitation(invitation)}
              >
                <Link2Off className="size-4" />
                {t("team:TEAM_ACTION_DELETE")}
              </Button>
            </DataTableActionsCell>
          </td>
        </SettingsSectionAnchor>
      );
    },
    [dateTime, renderInvitationStatus, roleNameByCode, t],
  );

  const renderAcceptedRow = React.useCallback(
    (invitation: TeamInvitation) => {
      const roleCode = invitation.roleCode;
      const roleName = roleCode ? (roleNameByCode.get(roleCode) ?? roleCode) : null;
      const status = invitation.status;
      const processedAt = dateTime.formatDateTimeOrNull(
        invitation.acceptedAt || invitation.revokedAt,
      );
      const createdAt = dateTime.formatDateTimeOrNull(invitation.createdAt);

      return (
        <SettingsSectionAnchor
          key={invitation.id}
          as="tr"
          section="accepted-invitations"
          className="border-b border-border/50 last:border-b-0"
        >
          <td className="py-4 pr-4 text-callout text-label-primary">{invitation.email || "-"}</td>
          <td className="px-4 py-4 text-callout text-label-primary">{roleName || "-"}</td>
          <td className="px-4 py-4">
            <InvitationStatusTag status={status} label={renderInvitationStatus(status)} />
          </td>
          <td className="px-4 py-4">
            <InvitationUserLabel
              user={invitation.acceptedBy}
              roleLabel={roleName}
              status={status}
              statusLabel={renderInvitationStatus(status)}
              details={buildInvitationUserDetails({
                t,
                dateTime,
                inviteeEmail: invitation.email,
                createdAt: invitation.createdAt,
                expiresAt: invitation.expiresAt,
                processedAt: invitation.acceptedAt || invitation.revokedAt,
                processedAtLabel: t("team:TEAM_INVITATIONS_COL_PROCESSED"),
              })}
            />
          </td>
          <td className="px-4 py-4 text-callout text-label-primary">
            <span className={processedAt ? "" : "text-label-secondary"}>{processedAt || "-"}</span>
          </td>
          <td className="py-4 pl-4 text-callout text-label-primary">
            <span className={createdAt ? "" : "text-label-secondary"}>{createdAt || "-"}</span>
          </td>
        </SettingsSectionAnchor>
      );
    },
    [dateTime, renderInvitationStatus, roleNameByCode, t],
  );

  const renderInviteLinkRow = React.useCallback(
    (link: TeamInviteLink) => {
      const roleName = link.roleCode ? (roleNameByCode.get(link.roleCode) ?? link.roleCode) : null;
      const createdAt = dateTime.formatDateTimeOrNull(link.createdAt);
      const expiresAt = dateTime.formatDateTimeOrNull(link.expiresAt);
      const disabled = Boolean(link.disabledAt);
      const canManage = !disabled;
      const code = link.displayCode;
      const token = link.token;
      const inviteUrl =
        link.inviteUrl ??
        (typeof window !== "undefined"
          ? `${window.location.origin}/invitations?token=${encodeURIComponent(token)}`
          : null);

      return (
        <SettingsSectionAnchor
          key={link.id}
          as="tr"
          section="invite-links"
          className="border-b border-border/50 last:border-b-0"
        >
          <td className="py-4 pr-4">
            <InvitationUserLabel
              user={link.createdBy}
              roleLabel={roleName}
              usesCount={Number(link.usesCount || 0)}
              details={buildInvitationUserDetails({
                t,
                dateTime,
                createdAt: link.createdAt,
                expiresAt: link.expiresAt,
                lastUsedAt: link.lastUsedAt,
                lastUsedAtLabel: t("team:TEAM_INVITE_LINKS_COL_LAST_USED"),
              })}
            />
          </td>
          <td className="px-4 py-4">
            <Button
              variant="link"
              size="sm"
              className="px-0 font-mono text-footnote"
              onClick={() => {
                const text = inviteUrl || code;
                void navigator.clipboard.writeText(text);
                notifySuccessText(t("team:TEAM_ACTION_COPIED"));
              }}
              aria-label={t("team:TEAM_INVITE_LINKS_ACTION_COPY_LINK")}
            >
              {code}
            </Button>
          </td>
          <td className="px-4 py-4">
            {Number(link.usesCount || 0) > 0 ? (
              <InviteLinkParticipantsPopover
                workspaceId={String(workspaceId || "")}
                linkId={link.id}
                usesCount={Number(link.usesCount || 0)}
                primaryUser={link.recentParticipants?.[0]?.user ?? link.lastUsedBy ?? null}
                lastUsedAt={link.lastUsedAt}
              />
            ) : (
              <span className="text-label-secondary text-callout">
                {t("team:TEAM_INVITE_LINKS_PARTICIPANT_EMPTY")}
              </span>
            )}
          </td>
          <td className="px-4 py-4 text-callout text-label-primary">
            <span className={createdAt ? "" : "text-label-secondary"}>{createdAt || "-"}</span>
          </td>
          <td className="px-4 py-4 text-callout text-label-primary">
            <span className={expiresAt ? "" : "text-label-secondary"}>
              {expiresAt || t("team:TEAM_INVITATIONS_NEVER_EXPIRES")}
            </span>
          </td>
          <td className={`py-4 pl-4 ${INVITATIONS_ACTION_COLUMN_CLASSNAME}`}>
            <DataTableActionsCell>
              <Button
                variant="ghost"
                size="sm"
                disabled={!canManage}
                onClick={() => {
                  setRenewExpiresInSeconds(7 * 24 * 60 * 60);
                  setRenewLink(link);
                }}
              >
                <RotateCcw className="size-4" />
                {t("team:TEAM_ACTION_RENEW")}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={!canManage}
                onClick={() => disableLinkMutation.mutate(link.id)}
              >
                <Link2Off className="size-4" />
                {t("team:TEAM_INVITE_LINKS_ACTION_DISABLE")}
              </Button>
            </DataTableActionsCell>
          </td>
        </SettingsSectionAnchor>
      );
    },
    [dateTime, disableLinkMutation, roleNameByCode, t, workspaceId],
  );

  const currentToolbar =
    tab === "pending" ? (
      <PageExtraToolbar
        className="items-center lg:flex-nowrap"
        leading={
          <ChromeTabsList className="w-auto">
            {tabs.map((item) => (
              <ChromeTabsTrigger key={item.value} value={item.value}>
                {item.label}
              </ChromeTabsTrigger>
            ))}
          </ChromeTabsList>
        }
        trailing={
          <>
            <DataTableSearchInput
              value={pendingSearchInput}
              onChange={setPendingSearchInput}
              placeholder={t("team:TEAM_INVITATIONS_SEARCH_PENDING_PLACEHOLDER")}
              clearLabel={t("common:CLEAR")}
              className="w-[min(100%,20rem)] min-w-[r12em]"
            />
            <Select
              value={pendingSort}
              onValueChange={(next) => setPendingSort(next as InvitationSort)}
            >
              <SelectTrigger className="w-40 min-w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start" position="popper">
                <SelectItem value="-created_at">{t("team:TEAM_SORT_NEWEST")}</SelectItem>
                <SelectItem value="created_at">{t("team:TEAM_SORT_OLDEST")}</SelectItem>
                <SelectItem value="email">{t("team:TEAM_SORT_EMAIL_AZ")}</SelectItem>
                <SelectItem value="-email">{t("team:TEAM_SORT_EMAIL_ZA")}</SelectItem>
                <SelectItem value="expires_at">{t("team:TEAM_INVITATIONS_COL_EXPIRES")}</SelectItem>
                <SelectItem value="-expires_at">{t("team:TEAM_SORT_LAST_LOGIN_RECENT")}</SelectItem>
                <SelectItem value="status">{t("team:TEAM_SORT_MEMBER_STATUS")}</SelectItem>
                <SelectItem value="-status">{t("team:TEAM_SORT_MEMBER_STATUS_DESC")}</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
        leadingClassName="items-center lg:flex-nowrap"
        trailingClassName="w-full flex-wrap justify-start gap-3 sm:flex-nowrap lg:w-auto lg:justify-end"
      />
    ) : tab === "accepted" ? (
      <PageExtraToolbar
        className="items-center lg:flex-nowrap"
        leading={
          <ChromeTabsList className="w-auto">
            {tabs.map((item) => (
              <ChromeTabsTrigger key={item.value} value={item.value}>
                {item.label}
              </ChromeTabsTrigger>
            ))}
          </ChromeTabsList>
        }
        trailing={
          <>
            <DataTableSearchInput
              value={acceptedSearchInput}
              onChange={setAcceptedSearchInput}
              placeholder={t("team:TEAM_INVITATIONS_SEARCH_ACCEPTED_PLACEHOLDER")}
              clearLabel={t("common:CLEAR")}
              className="w-[min(100%,20rem)] min-w-[r12em]"
            />
            <Select
              value={acceptedSort}
              onValueChange={(next) => setAcceptedSort(next as InvitationSort)}
            >
              <SelectTrigger className="w-40 min-w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start" position="popper">
                <SelectItem value="-created_at">{t("team:TEAM_SORT_NEWEST")}</SelectItem>
                <SelectItem value="created_at">{t("team:TEAM_SORT_OLDEST")}</SelectItem>
                <SelectItem value="email">{t("team:TEAM_SORT_EMAIL_AZ")}</SelectItem>
                <SelectItem value="-email">{t("team:TEAM_SORT_EMAIL_ZA")}</SelectItem>
                <SelectItem value="status">{t("team:TEAM_SORT_MEMBER_STATUS")}</SelectItem>
                <SelectItem value="-status">{t("team:TEAM_SORT_MEMBER_STATUS_DESC")}</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
        leadingClassName="items-center lg:flex-nowrap"
        trailingClassName="w-full flex-wrap justify-start gap-3 sm:flex-nowrap lg:w-auto lg:justify-end"
      />
    ) : (
      <PageExtraToolbar
        className="items-center lg:flex-nowrap"
        leading={
          <ChromeTabsList className="w-auto">
            {tabs.map((item) => (
              <ChromeTabsTrigger key={item.value} value={item.value}>
                {item.label}
              </ChromeTabsTrigger>
            ))}
          </ChromeTabsList>
        }
        trailing={
          <>
            <DataTableSearchInput
              value={linksSearchInput}
              onChange={setLinksSearchInput}
              placeholder={t("team:TEAM_INVITE_LINKS_SEARCH_PLACEHOLDER")}
              clearLabel={t("common:CLEAR")}
              className="w-[min(100%,20rem)] min-w-[r12em]"
            />
            <Select
              value={linksSort}
              onValueChange={(next) => setLinksSort(next as InviteLinkSort)}
            >
              <SelectTrigger className="w-40 min-w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start" position="popper">
                <SelectItem value="-created_at">{t("team:TEAM_SORT_NEWEST")}</SelectItem>
                <SelectItem value="created_at">{t("team:TEAM_SORT_OLDEST")}</SelectItem>
                <SelectItem value="display_code">{t("team:TEAM_INVITE_LINKS_COL_CODE")}</SelectItem>
                <SelectItem value="-display_code">
                  {t("team:TEAM_INVITE_LINKS_COL_CODE")}
                </SelectItem>
                <SelectItem value="-uses_count">
                  {t("team:TEAM_INVITE_LINKS_COL_PARTICIPANT")}
                </SelectItem>
                <SelectItem value="uses_count">
                  {t("team:TEAM_INVITE_LINKS_COL_PARTICIPANT")}
                </SelectItem>
              </SelectContent>
            </Select>
          </>
        }
        leadingClassName="items-center lg:flex-nowrap"
        trailingClassName="w-full flex-wrap justify-start gap-3 sm:flex-nowrap lg:w-auto lg:justify-end"
      />
    );

  const inviteAction = (
    <div className="flex items-center gap-2">
      <Button variant="outline" onClick={() => setInviteOpen(true)}>
        {t("team:TEAM_INVITE_CREATE_LINK_ACTION")}
      </Button>
      <Button onClick={() => setInviteEmailOpen(true)}>
        <Plus size={16} />
        {t("common:ORG_MEMBERS_INVITE")}
      </Button>
    </div>
  );

  const content = (
    <ChromeTabs value={tab} onValueChange={(next) => setTab(next as TabKey)}>
      {props.embedded ? <div className="min-w-0">{currentToolbar}</div> : null}

      <div className="flex min-h-0 flex-1 flex-col">
        <ChromeTabsContent value="pending" className="min-h-0 flex flex-col">
          <ContentGuard
            loading={Boolean(pendingInvitationsQuery.isLoading && !pendingInvitationsQuery.data)}
            error={pendingInvitationsQuery.error}
            empty={
              !pendingInvitationsQuery.isLoading &&
              !pendingInvitationsQuery.isError &&
              pendingInvitationRows.length === 0
            }
            onRetry={() => {
              void pendingInvitationsQuery.refetch();
            }}
            container="raw"
            loadingVariant="table"
            emptyTitle={t("team:TEAM_INVITATIONS_EMPTY_TITLE")}
            emptyDescription={t("team:TEAM_INVITATIONS_EMPTY_DESC")}
            variant="compact"
          >
            {pendingInvitationsQuery.isFetching &&
            !pendingInvitationsQuery.isLoading &&
            !pendingInvitationsQuery.isFetchingNextPage ? (
              <SettingsTableRefreshSkeleton />
            ) : null}
            <div className="min-w-0 overflow-x-auto">
              <table className="min-w-[72rem] w-full table-fixed border-collapse">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="w-[20%] py-2 pr-4 text-left text-callout font-semibold text-label-secondary">
                      {t("team:TEAM_INVITATIONS_COL_EMAIL")}
                    </th>
                    <th className="w-[20%] px-4 py-2 text-left text-callout font-semibold font-medium text-label-secondary">
                      {t("team:TEAM_INVITE_LINKS_COL_CREATOR")}
                    </th>
                    <th className="w-[12%] px-4 py-2 text-left text-callout font-semibold font-medium text-label-secondary">
                      {t("team:TEAM_INVITATIONS_COL_STATUS")}
                    </th>
                    <th className="w-[14%] px-4 py-2 text-left text-callout font-semibold font-medium text-label-secondary">
                      {t("team:TEAM_INVITATIONS_COL_CREATED")}
                    </th>
                    <th className="w-[14%] px-4 py-2 text-left text-callout font-semibold font-medium text-label-secondary">
                      {t("team:TEAM_INVITATIONS_COL_EXPIRES")}
                    </th>
                    <th
                      className={`w-[24%] py-2 pl-4 text-right text-footnote font-medium text-label-secondary ${INVITATIONS_ACTION_COLUMN_CLASSNAME}`}
                    />
                  </tr>
                </thead>
                <tbody>{pendingInvitationRows.map(renderPendingRow)}</tbody>
              </table>
            </div>
            {pendingInvitationsQuery.data && pendingInvitationRows.length > 0
              ? renderLoadMoreFooter(pendingInvitationsQuery)
              : null}
          </ContentGuard>
        </ChromeTabsContent>

        <ChromeTabsContent value="accepted" className="min-h-0 flex flex-col">
          <ContentGuard
            loading={Boolean(acceptedInvitationsQuery.isLoading && !acceptedInvitationsQuery.data)}
            error={acceptedInvitationsQuery.error}
            empty={
              !acceptedInvitationsQuery.isLoading &&
              !acceptedInvitationsQuery.isError &&
              acceptedInvitationRows.length === 0
            }
            onRetry={() => {
              void acceptedInvitationsQuery.refetch();
            }}
            container="raw"
            loadingVariant="table"
            emptyTitle={t("team:TEAM_INVITATIONS_EMPTY_TITLE")}
            emptyDescription={t("team:TEAM_INVITATIONS_EMPTY_DESC")}
            variant="compact"
          >
            {acceptedInvitationsQuery.isFetching &&
            !acceptedInvitationsQuery.isLoading &&
            !acceptedInvitationsQuery.isFetchingNextPage ? (
              <SettingsTableRefreshSkeleton />
            ) : null}
            <div className="min-w-0 overflow-x-auto">
              <table className="min-w-[72rem] w-full table-fixed border-collapse">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="w-[18%] py-2 pr-4 text-left text-callout font-semibold text-label-secondary">
                      {t("team:TEAM_INVITATIONS_COL_EMAIL")}
                    </th>
                    <th className="w-[14%] px-4 py-2 text-left text-callout font-semibold font-medium text-label-secondary">
                      {t("team:TEAM_INVITATIONS_COL_ROLE")}
                    </th>
                    <th className="w-[12%] px-4 py-2 text-left text-callout font-semibold font-medium text-label-secondary">
                      {t("team:TEAM_INVITATIONS_COL_STATUS")}
                    </th>
                    <th className="w-[22%] px-4 py-2 text-left text-callout font-semibold font-medium text-label-secondary">
                      {t("common:ORG_MEMBERS_TABLE_MEMBER")}
                    </th>
                    <th className="w-[16%] px-4 py-2 text-left text-callout font-semibold font-medium text-label-secondary">
                      {t("team:TEAM_INVITATIONS_COL_ACCEPTED")}
                    </th>
                    <th className="w-[18%] py-2 pl-4 text-left text-footnote font-medium text-label-secondary">
                      {t("team:TEAM_INVITATIONS_COL_CREATED")}
                    </th>
                  </tr>
                </thead>
                <tbody>{acceptedInvitationRows.map(renderAcceptedRow)}</tbody>
              </table>
            </div>
            {acceptedInvitationsQuery.data && acceptedInvitationRows.length > 0
              ? renderLoadMoreFooter(acceptedInvitationsQuery)
              : null}
          </ContentGuard>
        </ChromeTabsContent>

        <ChromeTabsContent value="links" className="min-h-0 flex flex-col">
          <ContentGuard
            loading={Boolean(inviteLinksQuery.isLoading && !inviteLinksQuery.data)}
            error={inviteLinksQuery.error}
            empty={
              !inviteLinksQuery.isLoading &&
              !inviteLinksQuery.isError &&
              inviteLinkRows.length === 0
            }
            onRetry={() => {
              void inviteLinksQuery.refetch();
            }}
            container="raw"
            loadingVariant="table"
            emptyTitle={t("team:TEAM_INVITE_LINKS_EMPTY_TITLE")}
            emptyDescription={t("team:TEAM_INVITE_LINKS_EMPTY_DESC")}
            variant="compact"
          >
            {inviteLinksQuery.isFetching &&
            !inviteLinksQuery.isLoading &&
            !inviteLinksQuery.isFetchingNextPage ? (
              <SettingsTableRefreshSkeleton />
            ) : null}
            <div className="min-w-0 overflow-x-auto">
              <table className="min-w-[72rem] w-full table-fixed border-collapse">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="w-[20%] py-2 pr-4 text-left text-callout font-semibold text-label-secondary">
                      {t("team:TEAM_INVITE_LINKS_COL_CREATOR")}
                    </th>
                    <th className="w-[16%] px-4 py-2 text-left text-callout font-semibold font-medium text-label-secondary">
                      {t("team:TEAM_INVITE_LINKS_COL_CODE")}
                    </th>
                    <th className="w-[18%] px-4 py-2 text-left text-callout font-semibold font-medium text-label-secondary">
                      {t("team:TEAM_INVITE_LINKS_COL_PARTICIPANT")}
                    </th>
                    <th className="w-[14%] px-4 py-2 text-left text-callout font-semibold font-medium text-label-secondary">
                      {t("team:TEAM_INVITE_LINKS_COL_CREATED")}
                    </th>
                    <th className="w-[14%] px-4 py-2 text-left text-callout font-semibold font-medium text-label-secondary">
                      {t("team:TEAM_INVITE_LINKS_COL_EXPIRES")}
                    </th>
                    <th
                      className={`w-[22%] py-2 pl-4 text-right text-footnote font-medium text-label-secondary ${INVITATIONS_ACTION_COLUMN_CLASSNAME}`}
                    />
                  </tr>
                </thead>
                <tbody>{inviteLinkRows.map(renderInviteLinkRow)}</tbody>
              </table>
            </div>
            {inviteLinksQuery.data && inviteLinkRows.length > 0
              ? renderLoadMoreFooter(inviteLinksQuery)
              : null}
          </ContentGuard>
        </ChromeTabsContent>
      </div>

      <InviteMembersDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        mode="link"
        workspaceId={String(workspaceId || "")}
        workspaceName={workspaceName}
        roles={rolesQuery.data?.items ?? []}
        rolesLoading={rolesQuery.isLoading}
        onInvited={() => {
          void invalidatePendingInvitations();
          void invalidateInviteLinks();
        }}
      />

      <InviteMembersDialog
        open={inviteEmailOpen}
        onOpenChange={setInviteEmailOpen}
        mode="email"
        workspaceId={String(workspaceId || "")}
        workspaceName={workspaceName}
        roles={rolesQuery.data?.items ?? []}
        rolesLoading={rolesQuery.isLoading}
        onInvited={() => {
          void invalidatePendingInvitations();
        }}
      />

      <TeamInvitationsDialogs
        t={t}
        deleteInvitation={deleteInvitation}
        setDeleteInvitation={setDeleteInvitation}
        deleteInvitationPending={deleteInvitationMutation.isPending}
        onDeleteInvitation={(invitationId) => deleteInvitationMutation.mutateAsync(invitationId)}
        renewInvitation={renewInvitation}
        setRenewInvitation={setRenewInvitation}
        renewInvitationPending={renewInvitationMutation.isPending}
        onRenewInvitation={(payload) => renewInvitationMutation.mutateAsync(payload)}
        renewLink={renewLink}
        setRenewLink={setRenewLink}
        renewLinkPending={renewLinkMutation.isPending}
        onRenewLink={(payload) => renewLinkMutation.mutateAsync(payload)}
        renewExpiresInSeconds={renewExpiresInSeconds}
        setRenewExpiresInSeconds={setRenewExpiresInSeconds}
        renewOptions={renewOptions}
      />
    </ChromeTabs>
  );

  if (props.embedded) {
    return content;
  }

  return (
    <DefaultPage
      title={t("nav:NAV_SETTINGS_TEAM_MEMBERS")}
      description={t("team:TEAM_INVITATIONS_DESC")}
      className="h-full"
      contentClassName="min-h-0 flex flex-col"
      action={inviteAction}
      extra={currentToolbar}
    >
      {content}
    </DefaultPage>
  );
}
