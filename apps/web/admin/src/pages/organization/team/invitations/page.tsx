import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { Button as AntButton, Input, Select, Tag } from "antd";
import { Copy, Link2Off, Plus, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  createOrganizationInviteLink,
  disableOrganizationInviteLink,
  inviteOrganizationMember,
  listOrganizationInviteLinks,
  listOrganizationInvitations,
  renewOrganizationInvitation,
  renewOrganizationInviteLink,
  revokeOrganizationInvitation,
  type OrganizationInvitation,
  type OrganizationInviteLink,
} from "@/api/organization-members";
import { listOrganizationRoles } from "@/api/organization-rbac";
import { DefaultPage } from "@/components/common/default-page";
import { useDataTable } from "@/components/data-table";
import {
  ChromeTabs,
  ChromeTabsContent,
  ChromeTabsList,
  ChromeTabsTrigger,
} from "@/components/ui/chrome-tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { useWorkspaceDateTimeFormatter } from "@/hooks/use-workspace-date-time-formatter";
import { renderUserLabel } from "@/pages/team/invitations/invitations-helpers";
import { TeamInvitationsTableSection } from "@/pages/team/invitations/invitations-table-section";
import {
  InviteOrganizationMemberDialog,
  type InviteOrganizationMemberFormValues,
  type InviteOrganizationRoleOption,
} from "@/pages/organization/team/shared/invite-organization-member-dialog";
import { useOrganizationWorkspaceContext } from "@/pages/organization/team/shared/use-organization-workspace-context";
import { getOrganizationRoleDisplayName } from "@/pages/organization/team/shared/role-i18n";
import { useDialogSnapshotState } from "@/pages/organization/team/shared/use-dialog-snapshot-state";

function toStatusTagColor(status: OrganizationInvitation["status"]): string {
  if (status === "accepted") return "green";
  if (status === "revoked") return "red";
  if (status === "expired") return "gold";
  return "blue";
}

type OrgInvitationsTab = "pending" | "processed" | "links";

type RenewExpiresInSeconds = number | null;

const RENEW_OPTIONS: Array<{ value: RenewExpiresInSeconds; key: string }> = [
  { value: 24 * 60 * 60, key: "team:TEAM_INVITE_LINK_EXPIRES_1_DAY" },
  { value: 7 * 24 * 60 * 60, key: "team:TEAM_INVITE_LINK_EXPIRES_7_DAYS" },
  { value: 30 * 24 * 60 * 60, key: "team:TEAM_INVITE_LINK_EXPIRES_30_DAYS" },
  { value: null, key: "team:TEAM_INVITE_LINK_EXPIRES_NEVER" },
];

export function OrganizationTeamInvitationsPage() {
  const { t } = useTranslation(["nav", "common", "team"]);
  const queryClient = useQueryClient();
  const orgWorkspaceContext = useOrganizationWorkspaceContext();
  const dateTime = useWorkspaceDateTimeFormatter({
    workspaceId: orgWorkspaceContext.workspaceId ?? undefined,
  });

  const [tab, setTab] = useState<OrgInvitationsTab>("pending");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [linkCreateOpen, setLinkCreateOpen] = useState(false);
  const [renewExpiresInSeconds, setRenewExpiresInSeconds] = useState<RenewExpiresInSeconds>(
    7 * 24 * 60 * 60,
  );

  const renewInvitationDialog = useDialogSnapshotState<OrganizationInvitation>();
  const revokeInvitationDialog = useDialogSnapshotState<OrganizationInvitation>();
  const renewLinkDialog = useDialogSnapshotState<OrganizationInviteLink>();
  const disableLinkDialog = useDialogSnapshotState<OrganizationInviteLink>();

  const [linkRoleCode, setLinkRoleCode] = useState<string>("member");
  const [linkExpiresInSeconds, setLinkExpiresInSeconds] = useState<RenewExpiresInSeconds>(
    7 * 24 * 60 * 60,
  );
  const [linkAllowedDomain, setLinkAllowedDomain] = useState<string>("");

  const rolesQuery = useQuery({
    queryKey: ["organization", "rbac", "roles"],
    queryFn: async () => listOrganizationRoles({ size: 200 }),
    staleTime: 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const roleNameByCode = useMemo(() => {
    const map = new Map<string, string>();
    for (const role of rolesQuery.data?.items ?? []) {
      map.set(role.code, getOrganizationRoleDisplayName(t, role.code, role.name));
    }
    map.set("owner", getOrganizationRoleDisplayName(t, "owner", map.get("owner")));
    map.set("admin", getOrganizationRoleDisplayName(t, "admin", map.get("admin")));
    map.set("member", getOrganizationRoleDisplayName(t, "member", map.get("member")));
    return map;
  }, [rolesQuery.data?.items, t]);

  const invitationStatusLabel = (status: OrganizationInvitation["status"]): string => {
    if (status === "accepted") return t("team:TEAM_INVITATION_STATUS_ACCEPTED");
    if (status === "revoked") return t("team:TEAM_INVITATION_STATUS_REVOKED");
    if (status === "expired") return t("team:TEAM_INVITATION_STATUS_EXPIRED");
    return t("team:TEAM_INVITATION_STATUS_PENDING");
  };

  const inviteMutation = useMutation({
    mutationFn: async (payload: InviteOrganizationMemberFormValues) => {
      const results = await Promise.allSettled(
        payload.emails.map((email) =>
          inviteOrganizationMember({
            email: email.trim(),
            roleCode: payload.roleCode,
            expiresInSeconds: payload.expiresInSeconds ?? undefined,
          }),
        ),
      );

      const successCount = results.filter((result) => result.status === "fulfilled").length;
      const failed = results.filter(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );
      const failedCount = failed.length;

      if (successCount === 0 && failedCount > 0) {
        throw failed[0]?.reason;
      }

      return { successCount, failedCount };
    },
    onSuccess: async (result) => {
      if (result.failedCount > 0) {
        notifySuccessText(
          t("team:TEAM_INVITE_SUCCESS_WITH_FAILURE", {
            count: result.successCount,
            failed: result.failedCount,
          }),
        );
      } else {
        notifySuccessText(t("team:TEAM_INVITE_SUCCESS", { count: result.successCount }));
      }
      setInviteOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["dataTable", "organization-invitations:pending"] });
    },
    onError: (err) => notifyError(err),
  });

  const createLinkMutation = useMutation({
    mutationFn: async () =>
      createOrganizationInviteLink({
        roleCode: linkRoleCode,
        allowedEmailDomain: linkAllowedDomain.trim() || null,
        expiresInSeconds: linkExpiresInSeconds,
      }),
    onSuccess: async (result) => {
      notifySuccessText(t("team:TEAM_ACTION_SUCCESS"));
      setLinkCreateOpen(false);
      setLinkAllowedDomain("");
      setLinkExpiresInSeconds(7 * 24 * 60 * 60);
      const text = result.inviteUrl || result.link.displayCode;
      if (text) {
        void navigator.clipboard.writeText(text);
      }
      await queryClient.invalidateQueries({ queryKey: ["dataTable", "organization-invite-links"] });
    },
    onError: (err) => notifyError(err),
  });

  const renewInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) =>
      renewOrganizationInvitation(invitationId, { expiresInSeconds: renewExpiresInSeconds }),
    onSuccess: async () => {
      notifySuccessText(t("team:TEAM_ACTION_SUCCESS"));
      renewInvitationDialog.close();
      await queryClient.invalidateQueries({ queryKey: ["dataTable", "organization-invitations:pending"] });
    },
    onError: (err) => notifyError(err),
  });

  const revokeInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) => revokeOrganizationInvitation(invitationId),
    onSuccess: async () => {
      notifySuccessText(t("team:TEAM_ACTION_SUCCESS"));
      revokeInvitationDialog.close();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["dataTable", "organization-invitations:pending"] }),
        queryClient.invalidateQueries({ queryKey: ["dataTable", "organization-invitations:processed"] }),
      ]);
    },
    onError: (err) => notifyError(err),
  });

  const renewLinkMutation = useMutation({
    mutationFn: async (linkId: string) =>
      renewOrganizationInviteLink(linkId, { expiresInSeconds: renewExpiresInSeconds }),
    onSuccess: async () => {
      notifySuccessText(t("team:TEAM_ACTION_SUCCESS"));
      renewLinkDialog.close();
      await queryClient.invalidateQueries({ queryKey: ["dataTable", "organization-invite-links"] });
    },
    onError: (err) => notifyError(err),
  });

  const disableLinkMutation = useMutation({
    mutationFn: async (linkId: string) => disableOrganizationInviteLink(linkId),
    onSuccess: async () => {
      notifySuccessText(t("team:TEAM_ACTION_SUCCESS"));
      disableLinkDialog.close();
      await queryClient.invalidateQueries({ queryKey: ["dataTable", "organization-invite-links"] });
    },
    onError: (err) => notifyError(err),
  });

  const pendingColumns = useMemo<Array<ColumnDef<OrganizationInvitation, unknown>>>(
    () => [
      {
        id: "email",
        header: t("team:TEAM_INVITATIONS_COL_EMAIL"),
        cell: ({ row }) => <span>{row.original.email || "-"}</span>,
      },
      {
        id: "inviter",
        header: t("team:TEAM_INVITE_LINKS_COL_CREATOR"),
        cell: ({ row }) => renderUserLabel(row.original.createdBy),
      },
      {
        id: "role",
        header: t("team:TEAM_INVITATIONS_COL_ROLE"),
        cell: ({ row }) => <Tag style={{ marginInlineEnd: 0 }}>{roleNameByCode.get(row.original.roleCode) || row.original.roleCode}</Tag>,
      },
      {
        id: "createdAt",
        header: t("team:TEAM_INVITATIONS_COL_CREATED"),
        cell: ({ row }) => {
          const formatted = dateTime.formatDate(row.original.createdAt, { emptyValue: "" });
          return <span className={formatted ? "" : "text-muted-foreground"}>{formatted || "-"}</span>;
        },
      },
      {
        id: "status",
        header: t("team:TEAM_INVITATIONS_COL_STATUS"),
        cell: ({ row }) => {
          const status = row.original.status;
          return <Tag color={toStatusTagColor(status)}>{invitationStatusLabel(status)}</Tag>;
        },
      },
      {
        id: "expiresAt",
        header: t("team:TEAM_INVITATIONS_COL_EXPIRES"),
        cell: ({ row }) => {
          const formatted = dateTime.formatDate(row.original.expiresAt, { emptyValue: "" });
          return (
            <span className={formatted ? "" : "text-muted-foreground"}>
              {formatted || t("team:TEAM_INVITATIONS_NEVER_EXPIRES")}
            </span>
          );
        },
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <AntButton
              type="text"
              icon={<RotateCcw className="size-4" />}
              onClick={() => {
                setRenewExpiresInSeconds(7 * 24 * 60 * 60);
                renewInvitationDialog.openWith(row.original);
              }}
            >
              {t("team:TEAM_ACTION_RENEW")}
            </AntButton>
            <AntButton type="text" danger onClick={() => revokeInvitationDialog.openWith(row.original)}>
              {t("team:TEAM_ACTION_DELETE")}
            </AntButton>
          </div>
        ),
      },
    ],
    [
      dateTime,
      invitationStatusLabel,
      renewInvitationDialog.openWith,
      revokeInvitationDialog.openWith,
      roleNameByCode,
      t,
    ],
  );

  const processedColumns = useMemo<Array<ColumnDef<OrganizationInvitation, unknown>>>(
    () => [
      {
        id: "invitee",
        header: t("team:TEAM_INVITATIONS_COL_EMAIL"),
        cell: ({ row }) => <span>{row.original.email || "-"}</span>,
      },
      {
        id: "role",
        header: t("team:TEAM_INVITATIONS_COL_ROLE"),
        cell: ({ row }) => <span>{roleNameByCode.get(row.original.roleCode) || row.original.roleCode}</span>,
      },
      {
        id: "status",
        header: t("team:TEAM_INVITATIONS_COL_STATUS"),
        cell: ({ row }) => {
          const status = row.original.status;
          return <Tag color={toStatusTagColor(status)}>{invitationStatusLabel(status)}</Tag>;
        },
      },
      {
        id: "processedBy",
        header: t("common:ORG_MEMBERS_TABLE_MEMBER"),
        cell: ({ row }) => (
          <span>
            {row.original.acceptedBy?.displayName ||
              row.original.acceptedBy?.username ||
              row.original.revokedBy?.displayName ||
              row.original.revokedBy?.username ||
              "-"}
          </span>
        ),
      },
      {
        id: "processedAt",
        header: t("team:TEAM_INVITATIONS_COL_ACCEPTED"),
        cell: ({ row }) => {
          const formatted = dateTime.formatDate(row.original.acceptedAt || row.original.revokedAt, {
            emptyValue: "",
          });
          return <span className={formatted ? "" : "text-muted-foreground"}>{formatted || "-"}</span>;
        },
      },
      {
        id: "createdAt",
        header: t("team:TEAM_INVITATIONS_COL_CREATED"),
        cell: ({ row }) => {
          const formatted = dateTime.formatDate(row.original.createdAt, { emptyValue: "" });
          return <span className={formatted ? "" : "text-muted-foreground"}>{formatted || "-"}</span>;
        },
      },
    ],
    [dateTime, invitationStatusLabel, roleNameByCode, t],
  );

  const linkColumns = useMemo<Array<ColumnDef<OrganizationInviteLink, unknown>>>(
    () => [
      {
        id: "creator",
        header: t("team:TEAM_INVITE_LINKS_COL_CREATOR"),
        cell: ({ row }) => renderUserLabel(row.original.createdBy),
      },
      {
        id: "code",
        header: t("team:TEAM_INVITE_LINKS_COL_CODE"),
        cell: ({ row }) => {
          const text = row.original.inviteUrl || row.original.displayCode;
          return (
            <AntButton
              type="link"
              className="font-mono"
              onClick={() => {
                void navigator.clipboard.writeText(text);
                notifySuccessText(t("team:TEAM_ACTION_COPIED"));
              }}
            >
              {row.original.displayCode}
            </AntButton>
          );
        },
      },
      {
        id: "participant",
        header: t("team:TEAM_INVITE_LINKS_COL_PARTICIPANT"),
        cell: ({ row }) => {
          const uses = Number(row.original.usesCount || 0);
          const latestParticipant =
            row.original.lastUsedBy?.displayName ||
            row.original.lastUsedBy?.username ||
            row.original.lastUsedBy?.email ||
            null;

          return (
            <div className="min-w-0">
              <div className="font-medium">{uses}</div>
              {latestParticipant ? (
                <div className="truncate text-xs text-muted-foreground">{latestParticipant}</div>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "createdAt",
        header: t("team:TEAM_INVITE_LINKS_COL_CREATED"),
        cell: ({ row }) => {
          const formatted = dateTime.formatDate(row.original.createdAt, { emptyValue: "" });
          return <span className={formatted ? "" : "text-muted-foreground"}>{formatted || "-"}</span>;
        },
      },
      {
        id: "expiresAt",
        header: t("team:TEAM_INVITE_LINKS_COL_EXPIRES"),
        cell: ({ row }) => {
          const formatted = dateTime.formatDate(row.original.expiresAt, { emptyValue: "" });
          return (
            <span className={formatted ? "" : "text-muted-foreground"}>
              {formatted || t("team:TEAM_INVITATIONS_NEVER_EXPIRES")}
            </span>
          );
        },
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <AntButton
              type="text"
              icon={<Copy className="size-4" />}
              onClick={() => {
                const text = row.original.inviteUrl || row.original.displayCode;
                void navigator.clipboard.writeText(text);
                notifySuccessText(t("team:TEAM_ACTION_COPIED"));
              }}
            >
              {t("team:TEAM_INVITE_LINKS_ACTION_COPY_LINK")}
            </AntButton>
            <AntButton
              type="text"
              icon={<RotateCcw className="size-4" />}
              onClick={() => {
                setRenewExpiresInSeconds(7 * 24 * 60 * 60);
                renewLinkDialog.openWith(row.original);
              }}
            >
              {t("team:TEAM_ACTION_RENEW")}
            </AntButton>
            <AntButton
              type="text"
              danger
              icon={<Link2Off className="size-4" />}
              onClick={() => disableLinkDialog.openWith(row.original)}
            >
              {t("team:TEAM_INVITE_LINKS_ACTION_DISABLE")}
            </AntButton>
          </div>
        ),
      },
    ],
    [dateTime, disableLinkDialog.openWith, renewLinkDialog.openWith, t],
  );

  const pendingTable = useDataTable<OrganizationInvitation, { status: "pending" }>({
    tableId: "organization-invitations:pending",
    columns: pendingColumns,
    extraQuery: { status: "pending" },
    initialState: { pageSize: 10 },
    fetcher: async (params) =>
      listOrganizationInvitations({
        page: params.page,
        size: params.size,
        q: params.q,
        status: params.status,
      }),
    queryOptions: {
      enabled: tab === "pending",
      staleTime: 20 * 1000,
      retry: false,
      meta: { silent: true },
    },
  });

  const processedTable = useDataTable<OrganizationInvitation, { status: "processed" }>({
    tableId: "organization-invitations:processed",
    columns: processedColumns,
    extraQuery: { status: "processed" },
    initialState: { pageSize: 10 },
    fetcher: async (params) =>
      listOrganizationInvitations({
        page: params.page,
        size: params.size,
        q: params.q,
        status: params.status,
      }),
    queryOptions: {
      enabled: tab === "processed",
      staleTime: 20 * 1000,
      retry: false,
      meta: { silent: true },
    },
  });

  const linksTable = useDataTable<OrganizationInviteLink>({
    tableId: "organization-invite-links",
    columns: linkColumns,
    initialState: { pageSize: 10 },
    fetcher: async (params) =>
      listOrganizationInviteLinks({
        page: params.page,
        size: params.size,
        q: params.q,
      }),
    queryOptions: {
      enabled: tab === "links",
      staleTime: 20 * 1000,
      retry: false,
      meta: { silent: true },
    },
  });

  const renewOptions = RENEW_OPTIONS.map((option) => ({ value: option.value, label: t(option.key) }));
  const roleOptions =
    (rolesQuery.data?.items ?? []).map((role) => ({
      value: role.code,
      label: getOrganizationRoleDisplayName(t, role.code, role.name),
    })) || [];
  if (!roleOptions.length) {
    roleOptions.push(
      { value: "owner", label: t("common:ORG_ROLE_OWNER") },
      { value: "admin", label: t("common:ORG_ROLE_ADMIN") },
      { value: "member", label: t("common:ORG_ROLE_MEMBER") },
    );
  }

  const roleOptionItems = roleOptions as InviteOrganizationRoleOption[];
  const defaultRoleCode = roleOptionItems.some((role) => role.value === "member")
    ? "member"
    : (roleOptionItems[0]?.value ?? "member");

  useEffect(() => {
    if (!roleOptionItems.some((item) => item.value === linkRoleCode)) {
      setLinkRoleCode(defaultRoleCode);
    }
  }, [defaultRoleCode, linkRoleCode, roleOptionItems]);

  return (
    <DefaultPage
      width="full"
      title={t("nav:NAV_SETTINGS_TEAM_MEMBERS")}
      description={t("common:ORG_INVITATIONS_DESC")}
      action={
        <div className="flex items-center gap-2">
          <AntButton type="primary" icon={<Plus size={16} />} onClick={() => setInviteOpen(true)}>
            {t("common:ORG_MEMBERS_INVITE")}
          </AntButton>
          <AntButton onClick={() => setLinkCreateOpen(true)}>{t("team:TEAM_INVITE_CREATE_LINK_ACTION")}</AntButton>
        </div>
      }
      contentClassName="min-h-0 flex flex-col"
    >
      <ChromeTabs value={tab} onValueChange={(next) => setTab(next as OrgInvitationsTab)}>
        <ChromeTabsList className="w-auto">
          <ChromeTabsTrigger value="pending">{t("team:TEAM_INVITATIONS_TAB_PENDING")}</ChromeTabsTrigger>
          <ChromeTabsTrigger value="processed">{t("team:TEAM_INVITATIONS_TAB_ACCEPTED")}</ChromeTabsTrigger>
          <ChromeTabsTrigger value="links">{t("team:TEAM_INVITATIONS_TAB_LINKS")}</ChromeTabsTrigger>
        </ChromeTabsList>

        <ChromeTabsContent value="pending" className="min-h-0 flex flex-col">
          <TeamInvitationsTableSection
            tableHook={pendingTable}
            placeholder={t("team:TEAM_INVITATIONS_SEARCH_PENDING_PLACEHOLDER")}
            emptyTitle={t("common:ORG_INVITATIONS_EMPTY_TITLE")}
            emptyDescription={t("common:ORG_INVITATIONS_EMPTY_DESC")}
            showSearch
            t={t}
          />
        </ChromeTabsContent>

        <ChromeTabsContent value="processed" className="min-h-0 flex flex-col">
          <TeamInvitationsTableSection
            tableHook={processedTable}
            placeholder={t("team:TEAM_INVITATIONS_SEARCH_ACCEPTED_PLACEHOLDER")}
            emptyTitle={t("common:ORG_INVITATIONS_EMPTY_TITLE")}
            emptyDescription={t("common:ORG_INVITATIONS_EMPTY_DESC")}
            showSearch
            t={t}
          />
        </ChromeTabsContent>

        <ChromeTabsContent value="links" className="min-h-0 flex flex-col">
          <TeamInvitationsTableSection
            tableHook={linksTable}
            placeholder={t("team:TEAM_INVITE_LINKS_SEARCH_PLACEHOLDER")}
            emptyTitle={t("team:TEAM_INVITE_LINKS_EMPTY_TITLE")}
            emptyDescription={t("team:TEAM_INVITE_LINKS_EMPTY_DESC")}
            showSearch
            t={t}
          />
        </ChromeTabsContent>
      </ChromeTabs>

      <InviteOrganizationMemberDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        loading={inviteMutation.isPending}
        roleOptions={roleOptionItems}
        defaultRoleCode={defaultRoleCode}
        onSubmit={async (values) => {
          await inviteMutation.mutateAsync(values);
        }}
      />

      <Dialog open={linkCreateOpen} onOpenChange={setLinkCreateOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("team:TEAM_INVITE_CREATE_LINK_ACTION")}</DialogTitle>
            <DialogDescription>{t("common:ORG_INVITATIONS_DESC")}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 py-2">
            <div className="grid gap-1.5">
              <label className="text-sm font-medium text-foreground">{t("team:TEAM_INVITE_FIELD_ROLE")}</label>
              <Select
                value={linkRoleCode}
                showSearch
                optionFilterProp="label"
                onChange={(next) => setLinkRoleCode(String(next))}
                options={roleOptions}
                placeholder={t("team:TEAM_INVITE_FIELD_ROLE_PLACEHOLDER")}
                getPopupContainer={(node) => node.parentElement ?? document.body}
                style={{ width: "100%" }}
              />
              <div className="text-xs text-muted-foreground">{t("team:TEAM_INVITE_ROLE_HELP")}</div>
            </div>

            <div className="grid gap-1.5">
              <label className="text-sm font-medium text-foreground">{t("team:TEAM_INVITE_LINK_FIELD_EXPIRES")}</label>
              <Select
                value={linkExpiresInSeconds}
                onChange={(next) => setLinkExpiresInSeconds(next)}
                options={renewOptions}
                getPopupContainer={(node) => node.parentElement ?? document.body}
                style={{ width: "100%" }}
              />
            </div>

            <div className="grid gap-1.5">
              <label className="text-sm font-medium text-foreground">{t("common:ORG_INVITE_LINK_ALLOWED_DOMAIN_LABEL")}</label>
              <Input
                value={linkAllowedDomain}
                onChange={(event) => setLinkAllowedDomain(event.target.value)}
                placeholder={t("common:ORG_INVITE_LINK_ALLOWED_DOMAIN_PLACEHOLDER")}
              />
            </div>
          </div>

          <DialogFooter>
            <AntButton onClick={() => setLinkCreateOpen(false)} disabled={createLinkMutation.isPending}>
              {t("common:CANCEL")}
            </AntButton>
            <AntButton
              type="primary"
              loading={createLinkMutation.isPending}
              onClick={() => createLinkMutation.mutate()}
            >
              {t("common:CONFIRM")}
            </AntButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renewInvitationDialog.open} onOpenChange={renewInvitationDialog.onOpenChange}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("team:TEAM_INVITATIONS_RENEW_TITLE")}</DialogTitle>
            <DialogDescription>
              {renewInvitationDialog.displayPayload
                ? t("team:TEAM_INVITATIONS_RENEW_DESC", {
                    email: renewInvitationDialog.displayPayload.email || "-",
                  })
                : null}
            </DialogDescription>
          </DialogHeader>

          {renewInvitationDialog.displayPayload ? (
            <div className="space-y-3 py-2">
              <Select
                value={renewExpiresInSeconds}
                onChange={(value) => setRenewExpiresInSeconds(value)}
                options={renewOptions}
                style={{ width: "100%" }}
                getPopupContainer={(node) => node.parentElement ?? document.body}
              />
            </div>
          ) : null}

          <DialogFooter>
            <AntButton onClick={renewInvitationDialog.close} disabled={renewInvitationMutation.isPending}>
              {t("common:CANCEL")}
            </AntButton>
            <AntButton
              type="primary"
              loading={renewInvitationMutation.isPending}
              onClick={() => {
                const active = renewInvitationDialog.displayPayload;
                if (!active) return;
                void renewInvitationMutation.mutateAsync(active.id);
              }}
            >
              {t("team:TEAM_ACTION_RENEW")}
            </AntButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={revokeInvitationDialog.open} onOpenChange={revokeInvitationDialog.onOpenChange}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("team:TEAM_INVITATIONS_DELETE_TITLE")}</DialogTitle>
            <DialogDescription>
              {revokeInvitationDialog.displayPayload
                ? t("team:TEAM_INVITATIONS_DELETE_DESC", { email: revokeInvitationDialog.displayPayload.email || "-" })
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <AntButton onClick={revokeInvitationDialog.close} disabled={revokeInvitationMutation.isPending}>
              {t("common:CANCEL")}
            </AntButton>
            <AntButton
              type="primary"
              danger
              loading={revokeInvitationMutation.isPending}
              onClick={() => {
                const active = revokeInvitationDialog.displayPayload;
                if (!active) return;
                void revokeInvitationMutation.mutateAsync(active.id);
              }}
            >
              {t("team:TEAM_ACTION_DELETE")}
            </AntButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renewLinkDialog.open} onOpenChange={renewLinkDialog.onOpenChange}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("team:TEAM_INVITE_LINKS_RENEW_TITLE")}</DialogTitle>
            <DialogDescription>
              {renewLinkDialog.displayPayload
                ? t("team:TEAM_INVITE_LINKS_RENEW_DESC", { code: renewLinkDialog.displayPayload.displayCode })
                : null}
            </DialogDescription>
          </DialogHeader>

          {renewLinkDialog.displayPayload ? (
            <div className="space-y-3 py-2">
              <Select
                value={renewExpiresInSeconds}
                onChange={(value) => setRenewExpiresInSeconds(value)}
                options={renewOptions}
                style={{ width: "100%" }}
                getPopupContainer={(node) => node.parentElement ?? document.body}
              />
            </div>
          ) : null}

          <DialogFooter>
            <AntButton onClick={renewLinkDialog.close} disabled={renewLinkMutation.isPending}>
              {t("common:CANCEL")}
            </AntButton>
            <AntButton
              type="primary"
              loading={renewLinkMutation.isPending}
              onClick={() => {
                const active = renewLinkDialog.displayPayload;
                if (!active) return;
                void renewLinkMutation.mutateAsync(active.id);
              }}
            >
              {t("team:TEAM_ACTION_RENEW")}
            </AntButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={disableLinkDialog.open} onOpenChange={disableLinkDialog.onOpenChange}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("team:TEAM_INVITE_LINKS_ACTION_DISABLE")}</DialogTitle>
            <DialogDescription>
              {disableLinkDialog.displayPayload
                ? t("team:TEAM_INVITE_LINKS_DISABLE_DESC", { code: disableLinkDialog.displayPayload.displayCode })
                : null}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <AntButton onClick={disableLinkDialog.close} disabled={disableLinkMutation.isPending}>
              {t("common:CANCEL")}
            </AntButton>
            <AntButton
              type="primary"
              danger
              loading={disableLinkMutation.isPending}
              onClick={() => {
                const active = disableLinkDialog.displayPayload;
                if (!active) return;
                void disableLinkMutation.mutateAsync(active.id);
              }}
            >
              {t("team:TEAM_INVITE_LINKS_ACTION_DISABLE")}
            </AntButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DefaultPage>
  );
}
