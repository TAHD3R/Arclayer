"use client";

import type { MenuProps } from "antd";
import { Avatar, Button as AntButton, Dropdown, Input, Pagination, Tag } from "antd";
import { Copy, EllipsisVertical, Link2Off, Plus, RotateCcw, Search } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { flexRender, type ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as authApi from "@/api/auth";
import { listAdminRoles } from "@/api/rbac";
import { listMyInvitations, type MyInvitation } from "@/api/invitations";
import {
  disableAllTeamInviteLinks,
  disableTeamInviteLink,
  listTeamInviteLinks,
  renewTeamInviteLink,
  type TeamInviteLink,
} from "@/api/team";
import { DefaultPage } from "@/components/app/defaultPage";
import { PageState } from "@/components/app/pageState";
import { useDataTable } from "@/components/customized/table";
import {
  ChromeTabs,
  ChromeTabsContent,
  ChromeTabsList,
  ChromeTabsTrigger,
} from "@/components/ui/chrome-tabs";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/animate-ui/components/radix/alert-dialog";
import {
  AlertDialogAction as AlertDialogActionPrimitive,
  AlertDialogCancel as AlertDialogCancelPrimitive,
} from "@/components/animate-ui/primitives/radix/alert-dialog";
import { Button } from "@/components/ui/button";
import { LoaderOne } from "@/components/ui/loader";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { notifyError, notifySuccessText } from "@/utils/notifications";
import { CreateInviteLinkDialog } from "@/views/team/components/CreateInviteLinkDialog";
import { InviteMembersDialog } from "@/views/team/components/InviteMembersDialog";
import { useAuthStore } from "@/stores/useAuthStore";
import { useOrgStore } from "@/stores/useOrgStore";

type TabKey = "pending" | "accepted" | "links";

function formatDateTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString();
}

function userInitials(label: string | null | undefined): string {
  const v = String(label || "U").trim();
  return v.slice(0, 1).toUpperCase();
}

function renderUserLabel(
  user: {
    username: string;
    email: string | null;
    displayName: string | null;
    avatarUrl: string | null;
  } | null,
): React.ReactNode {
  if (!user) return <span className="text-muted-foreground">-</span>;
  const primary = (user.displayName || user.username || user.email || "-").trim() || "-";
  const secondary = user.email || user.username || "";
  return (
    <div className="flex items-center gap-2 min-w-0">
      <Avatar
        size={24}
        shape="square"
        src={user.avatarUrl || undefined}
        style={{
          backgroundColor: "var(--color-muted)",
          color: "var(--color-foreground)",
          flexShrink: 0,
        }}
      >
        {userInitials(primary)}
      </Avatar>
      <div className="min-w-0">
        <div className="text-sm font-medium truncate">{primary}</div>
        {secondary ? (
          <div className="text-xs text-muted-foreground truncate">{secondary}</div>
        ) : null}
      </div>
    </div>
  );
}

export function TeamInvitationsView() {
  const { t } = useTranslation(["team", "nav", "common"]);
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  const currentOrgId = useOrgStore((s) => s.currentOrgId);

  const [tab, setTab] = React.useState<TabKey>("pending");
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [createLinkOpen, setCreateLinkOpen] = React.useState(false);
  const [disableAllOpen, setDisableAllOpen] = React.useState(false);

  const orgsQuery = useQuery({
    queryKey: ["auth", "me", "orgs"],
    enabled: Boolean(accessToken),
    queryFn: async () => authApi.meOrgs({ size: 200 }),
    staleTime: 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const orgName = React.useMemo(() => {
    const items = orgsQuery.data?.items ?? [];
    const found = currentOrgId
      ? items.find((o) => String(o.organization_id) === String(currentOrgId))
      : undefined;
    return found?.name || t("team:TEAM_WORKSPACE_FALLBACK");
  }, [currentOrgId, orgsQuery.data?.items, t]);

  const rolesQuery = useQuery({
    queryKey: ["rbac", "roles", "list"],
    queryFn: async () => listAdminRoles({ size: 200 }),
    staleTime: 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const disableLinkMutation = useMutation({
    mutationFn: disableTeamInviteLink,
    onSuccess: () => {
      notifySuccessText(t("team:TEAM_ACTION_SUCCESS"));
      void queryClient.invalidateQueries({ queryKey: ["dataTable", "team-invite-links"] });
    },
    onError: (err) => notifyError(err),
  });

  const renewLinkMutation = useMutation({
    mutationFn: async (linkId: string) => renewTeamInviteLink(linkId, {}),
    onSuccess: () => {
      notifySuccessText(t("team:TEAM_ACTION_SUCCESS"));
      void queryClient.invalidateQueries({ queryKey: ["dataTable", "team-invite-links"] });
    },
    onError: (err) => notifyError(err),
  });

  const disableAllLinksMutation = useMutation({
    mutationFn: disableAllTeamInviteLinks,
    onSuccess: () => {
      notifySuccessText(t("team:TEAM_ACTION_SUCCESS"));
      void queryClient.invalidateQueries({ queryKey: ["dataTable", "team-invite-links"] });
      setDisableAllOpen(false);
    },
    onError: (err) => notifyError(err),
  });

  const pendingExtraQuery = React.useMemo(() => ({ status: "pending" as const }), []);
  const acceptedExtraQuery = React.useMemo(() => ({ status: "accepted" as const }), []);

  const myInvitationsColumns = React.useMemo<ColumnDef<MyInvitation, unknown>[]>(() => {
    return [
      {
        id: "org",
        meta: { title: t("team:TEAM_MY_INVITATIONS_COL_ORG") },
        header: t("team:TEAM_MY_INVITATIONS_COL_ORG"),
        cell: ({ row }) => {
          const org = row.original.organization;
          return <span className="font-medium">{org?.name || "-"}</span>;
        },
      },
      {
        id: "inviter",
        meta: { title: t("team:TEAM_MY_INVITATIONS_COL_INVITER") },
        header: t("team:TEAM_MY_INVITATIONS_COL_INVITER"),
        cell: ({ row }) => renderUserLabel(row.original.inviter),
      },
      {
        accessorKey: "roleCode",
        meta: { title: t("team:TEAM_INVITATIONS_COL_ROLE") },
        header: t("team:TEAM_INVITATIONS_COL_ROLE"),
        cell: ({ row }) => (
          <span className={row.original.roleCode ? "" : "text-muted-foreground"}>
            {row.original.roleCode || "-"}
          </span>
        ),
      },
      {
        accessorKey: "expiresAt",
        meta: { title: t("team:TEAM_INVITATIONS_COL_EXPIRES") },
        header: t("team:TEAM_INVITATIONS_COL_EXPIRES"),
        cell: ({ row }) => {
          const formatted = formatDateTime(row.original.expiresAt);
          return (
            <span className={formatted ? "" : "text-muted-foreground"}>
              {formatted || t("team:TEAM_INVITATIONS_NEVER_EXPIRES")}
            </span>
          );
        },
      },
      {
        accessorKey: "createdAt",
        meta: { title: t("team:TEAM_INVITATIONS_COL_CREATED") },
        header: t("team:TEAM_INVITATIONS_COL_CREATED"),
        cell: ({ row }) => {
          const formatted = formatDateTime(row.original.createdAt);
          return (
            <span className={formatted ? "" : "text-muted-foreground"}>{formatted || "-"}</span>
          );
        },
      },
      {
        id: "status",
        meta: { title: t("team:TEAM_TABLE_COL_STATUS") },
        header: t("team:TEAM_TABLE_COL_STATUS"),
        cell: ({ row }) => {
          const s = row.original.status;
          return (
            <Tag color={s === "accepted" ? "green" : "blue"} style={{ marginInlineEnd: 0 }}>
              {s === "accepted"
                ? t("team:TEAM_INVITATION_STATUS_ACCEPTED")
                : t("team:TEAM_INVITATION_STATUS_PENDING")}
            </Tag>
          );
        },
      },
    ];
  }, [t]);

  const inviteLinksColumns = React.useMemo<ColumnDef<TeamInviteLink, unknown>[]>(() => {
    return [
      {
        id: "creator",
        meta: { title: t("team:TEAM_INVITE_LINKS_COL_CREATOR") },
        header: t("team:TEAM_INVITE_LINKS_COL_CREATOR"),
        cell: ({ row }) => renderUserLabel(row.original.createdBy),
      },
      {
        accessorKey: "code",
        meta: { title: t("team:TEAM_INVITE_LINKS_COL_CODE") },
        header: t("team:TEAM_INVITE_LINKS_COL_CODE"),
        cell: ({ row }) => <span className="font-mono text-sm">{row.original.code}</span>,
      },
      {
        id: "participant",
        meta: { title: t("team:TEAM_INVITE_LINKS_COL_PARTICIPANT") },
        header: t("team:TEAM_INVITE_LINKS_COL_PARTICIPANT"),
        cell: ({ row }) => {
          const uses = Number(row.original.usesCount || 0);
          const lastUsedBy = row.original.lastUsedBy;
          if (!uses) return <span className="text-muted-foreground">-</span>;
          return (
            <div className="flex items-center gap-2 min-w-0">
              <Tag color="blue" style={{ marginInlineEnd: 0 }}>
                {uses}
              </Tag>
              <div className="min-w-0">{renderUserLabel(lastUsedBy)}</div>
            </div>
          );
        },
      },
      {
        accessorKey: "createdAt",
        meta: { title: t("team:TEAM_INVITE_LINKS_COL_CREATED") },
        header: t("team:TEAM_INVITE_LINKS_COL_CREATED"),
        cell: ({ row }) => {
          const formatted = formatDateTime(row.original.createdAt);
          return (
            <span className={formatted ? "" : "text-muted-foreground"}>{formatted || "-"}</span>
          );
        },
      },
      {
        accessorKey: "expiresAt",
        meta: { title: t("team:TEAM_INVITE_LINKS_COL_EXPIRES") },
        header: t("team:TEAM_INVITE_LINKS_COL_EXPIRES"),
        cell: ({ row }) => {
          const formatted = formatDateTime(row.original.expiresAt);
          return (
            <span className={formatted ? "" : "text-muted-foreground"}>
              {formatted || t("team:TEAM_INVITATIONS_NEVER_EXPIRES")}
            </span>
          );
        },
      },
      {
        id: "actions",
        enableHiding: false,
        meta: { title: t("team:TEAM_INVITE_LINKS_COL_ACTIONS") },
        header: "",
        cell: ({ row }) => {
          const link = row.original;
          const disabled = Boolean(link.disabledAt);
          const canManage = !disabled;

          const items: MenuProps["items"] = [
            {
              key: "copy_code",
              icon: <Copy className="size-4" />,
              label: t("team:TEAM_INVITE_LINKS_ACTION_COPY_CODE"),
              onClick: () => {
                void navigator.clipboard.writeText(link.code);
                notifySuccessText(t("team:TEAM_ACTION_COPIED"));
              },
            },
            { type: "divider" },
            {
              key: "renew",
              icon: <RotateCcw className="size-4" />,
              label: t("team:TEAM_ACTION_RENEW"),
              disabled: !canManage,
              onClick: () => renewLinkMutation.mutate(link.id),
            },
            {
              key: "disable",
              icon: <Link2Off className="size-4" />,
              label: t("team:TEAM_INVITE_LINKS_ACTION_DISABLE"),
              disabled: !canManage,
              danger: true,
              onClick: () => disableLinkMutation.mutate(link.id),
            },
          ];

          return (
            <Dropdown trigger={["click"]} menu={{ items }}>
              <Button
                variant="ghost"
                className="h-8 w-8 p-0"
                aria-label={t("team:TEAM_INVITE_LINKS_ACTIONS")}
              >
                <EllipsisVertical className="size-4" />
              </Button>
            </Dropdown>
          );
        },
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disableLinkMutation, renewLinkMutation, t]);

  const pendingTable = useDataTable<MyInvitation, { status: "pending" | "accepted" }>({
    tableId: "my-invitations-pending",
    columns: myInvitationsColumns,
    extraQuery: pendingExtraQuery,
    initialState: { pageSize: 10 },
    fetcher: async (params) =>
      listMyInvitations({
        page: params.page,
        size: params.size,
        q: params.q,
        status: (params.status ?? "pending") as "pending",
      }),
    queryOptions: {
      enabled: tab === "pending",
      staleTime: 20 * 1000,
      retry: false,
      meta: { silent: true },
    },
  });

  const acceptedTable = useDataTable<MyInvitation, { status: "pending" | "accepted" }>({
    tableId: "my-invitations-accepted",
    columns: myInvitationsColumns,
    extraQuery: acceptedExtraQuery,
    initialState: { pageSize: 10 },
    fetcher: async (params) =>
      listMyInvitations({
        page: params.page,
        size: params.size,
        q: params.q,
        status: (params.status ?? "accepted") as "accepted",
      }),
    queryOptions: {
      enabled: tab === "accepted",
      staleTime: 20 * 1000,
      retry: false,
      meta: { silent: true },
    },
  });

  const linksTable = useDataTable<TeamInviteLink, { mine: true }>({
    tableId: "team-invite-links",
    columns: inviteLinksColumns,
    extraQuery: { mine: true },
    initialState: { pageSize: 10 },
    fetcher: async (params) =>
      listTeamInviteLinks({
        page: params.page,
        size: params.size,
        q: params.q,
        mine: params.mine,
      }),
    queryOptions: {
      enabled: tab === "links",
      staleTime: 20 * 1000,
      retry: false,
      meta: { silent: true },
    },
  });

  const inviteAction = (
    <AntButton type="primary" icon={<Plus size={16} />} onClick={() => setInviteOpen(true)}>
      {t("team:TEAM_INVITE_MEMBER")}
    </AntButton>
  );

  const renderTable = <TRow,>(
    tableHook: ReturnType<typeof useDataTable<TRow>>,
    placeholder: string,
    emptyTitle: string,
    emptyDescription: string,
    showSearch: boolean,
  ) => {
    const empty = !tableHook.isLoading && tableHook.items.length === 0;
    const table = tableHook.table;
    const pageData = tableHook.pageData;

    return (
      <div className="min-h-0 flex flex-col gap-4">
        {showSearch ? (
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <Input
                value={tableHook.searchInput}
                onChange={(e) => tableHook.setSearchInput(e.target.value)}
                placeholder={placeholder}
                allowClear
                prefix={<Search className="size-4 text-muted-foreground" />}
                style={{ width: "100%" }}
              />
            </div>
            {tableHook.isFetching && !tableHook.isLoading ? <LoaderOne /> : null}
          </div>
        ) : null}

        <PageState
          loading={tableHook.isLoading}
          error={tableHook.error}
          onRetry={() => void tableHook.refetch()}
          empty={empty}
          loadingVariant="table"
          emptyTitle={emptyTitle}
          emptyDescription={emptyDescription}
          className="flex-1 min-h-0"
        >
          <div className="rounded-md border overflow-auto flex-1 min-h-0">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>

              <TableBody>
                {table.getRowModel().rows.length ? (
                  table.getRowModel().rows.map((row, rowIndex) => {
                    const stripeClass = rowIndex % 2 === 1 ? "bg-muted/20" : "bg-background";
                    return (
                      <TableRow
                        key={row.id}
                        className={cn(stripeClass, "hover:bg-muted/40 transition-colors")}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell
                      className="h-24 text-center text-muted-foreground"
                      colSpan={table.getVisibleLeafColumns().length}
                    >
                      {t("team:TEAM_EMPTY_TABLE")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {pageData ? (
            <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
              <div className="text-muted-foreground text-sm">
                {t("team:TEAM_PAGINATION_TOTAL", {
                  total: pageData.total,
                  from: pageData.total ? (pageData.page - 1) * pageData.size + 1 : 0,
                  to: Math.min(pageData.page * pageData.size, pageData.total),
                })}
              </div>
              <Pagination
                current={pageData.page}
                pageSize={pageData.size}
                total={pageData.total}
                showSizeChanger
                pageSizeOptions={[10, 20, 50, 100]}
                onChange={(nextPage, nextSize) => {
                  if (
                    typeof nextSize === "number" &&
                    nextSize !== table.getState().pagination.pageSize
                  ) {
                    table.setPageSize(nextSize);
                  }
                  table.setPageIndex(Math.max(0, nextPage - 1));
                }}
              />
            </div>
          ) : null}
        </PageState>
      </div>
    );
  };

  const inviteLinksTotal = linksTable.pageData?.total ?? 0;
  const showDisableAll = tab === "links" && inviteLinksTotal > 0;

  return (
    <DefaultPage
      title={t("nav:NAV_SETTINGS_TEAM_MEMBERS")}
      description={t("team:TEAM_INVITATIONS_DESC")}
      width="full"
      className="h-full"
      contentClassName="min-h-0 flex flex-col"
      action={inviteAction}
    >
      <ChromeTabs value={tab} onValueChange={(next) => setTab(next as TabKey)}>
        <ChromeTabsList className="w-auto">
          <ChromeTabsTrigger value="pending">
            {t("team:TEAM_INVITATIONS_TAB_PENDING")}
          </ChromeTabsTrigger>
          <ChromeTabsTrigger value="accepted">
            {t("team:TEAM_INVITATIONS_TAB_ACCEPTED")}
          </ChromeTabsTrigger>
          <ChromeTabsTrigger value="links">
            {t("team:TEAM_INVITATIONS_TAB_LINKS")}
          </ChromeTabsTrigger>
        </ChromeTabsList>

        <ChromeTabsContent value="pending" className="min-h-0 flex flex-col">
          {renderTable(
            pendingTable,
            t("team:TEAM_INVITATIONS_SEARCH_PENDING_PLACEHOLDER"),
            t("team:TEAM_INVITATIONS_EMPTY_TITLE"),
            t("team:TEAM_INVITATIONS_EMPTY_DESC"),
            true,
          )}
        </ChromeTabsContent>

        <ChromeTabsContent value="accepted" className="min-h-0 flex flex-col">
          {renderTable(
            acceptedTable,
            t("team:TEAM_INVITATIONS_SEARCH_ACCEPTED_PLACEHOLDER"),
            t("team:TEAM_INVITATIONS_EMPTY_TITLE"),
            t("team:TEAM_INVITATIONS_EMPTY_DESC"),
            true,
          )}
        </ChromeTabsContent>

        <ChromeTabsContent value="links" className="min-h-0 flex flex-col">
          <div className="flex items-center justify-end gap-2 pb-4">
            <AntButton
              type="primary"
              icon={<Plus size={16} />}
              onClick={() => setCreateLinkOpen(true)}
            >
              {t("team:TEAM_INVITE_LINKS_ACTION_CREATE")}
            </AntButton>
            {showDisableAll ? (
              <AntButton
                danger
                icon={<Link2Off size={16} />}
                onClick={() => setDisableAllOpen(true)}
              >
                {t("team:TEAM_INVITE_LINKS_ACTION_DISABLE_ALL")}
              </AntButton>
            ) : null}
          </div>

          {renderTable(
            linksTable,
            t("team:TEAM_INVITE_LINKS_SEARCH_PLACEHOLDER"),
            t("team:TEAM_INVITE_LINKS_EMPTY_TITLE"),
            t("team:TEAM_INVITE_LINKS_EMPTY_DESC"),
            true,
          )}
        </ChromeTabsContent>
      </ChromeTabs>

      <InviteMembersDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        orgName={orgName}
        roles={rolesQuery.data?.items ?? []}
        rolesLoading={rolesQuery.isLoading}
        onInvited={() => {
          // Inviting members creates an invite link; refresh my links list.
          void queryClient.invalidateQueries({ queryKey: ["dataTable", "team-invite-links"] });
        }}
      />

      <CreateInviteLinkDialog
        open={createLinkOpen}
        onOpenChange={setCreateLinkOpen}
        orgName={orgName}
        roles={rolesQuery.data?.items ?? []}
        rolesLoading={rolesQuery.isLoading}
        onCreated={() => {
          void queryClient.invalidateQueries({ queryKey: ["dataTable", "team-invite-links"] });
        }}
      />

      <AlertDialog open={disableAllOpen} onOpenChange={setDisableAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-bold! text-xl">
              {t("team:TEAM_INVITE_LINKS_DISABLE_ALL_TITLE")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base">
              {t("team:TEAM_INVITE_LINKS_DISABLE_ALL_DESC")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancelPrimitive asChild>
              <AntButton type="text" disabled={disableAllLinksMutation.isPending}>
                {t("common:CANCEL")}
              </AntButton>
            </AlertDialogCancelPrimitive>
            <AlertDialogActionPrimitive asChild>
              <AntButton
                type="primary"
                danger
                loading={disableAllLinksMutation.isPending}
                onClick={() => disableAllLinksMutation.mutate()}
              >
                {t("team:TEAM_INVITE_LINKS_ACTION_DISABLE_ALL")}
              </AntButton>
            </AlertDialogActionPrimitive>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DefaultPage>
  );
}
