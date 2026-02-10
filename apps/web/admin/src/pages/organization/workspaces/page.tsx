import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { flexRender, type ColumnDef } from "@tanstack/react-table";
import { useNavigate } from "@tanstack/react-router";
import {
  Avatar,
  Button as AntButton,
  Dropdown,
  Form,
  Input,
  List,
  Pagination,
  Popover,
  Spin,
  Tag,
} from "antd";
import type { MenuProps } from "antd";
import { ArrowRight, Archive, MoreVertical, Plus, Search, Trash2, Undo2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  archiveOrganizationWorkspace,
  createOrganizationWorkspace,
  deleteOrganizationWorkspace,
  listOrganizationWorkspaceMembers,
  listOrganizationWorkspaces,
  unarchiveOrganizationWorkspace,
  type OrganizationWorkspace,
  type OrganizationWorkspaceMember,
} from "@/api/organization-workspaces";
import { DefaultPage } from "@/components/common/default-page";
import { PageState } from "@/components/common/page-state";
import { SettingDialog } from "@/components/common/setting-dialog";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { useDataTable } from "@/components/data-table";
import {
  ChromeTabs,
  ChromeTabsBar,
  ChromeTabsContent,
  ChromeTabsList,
  ChromeTabsTrigger,
} from "@/components/ui/chrome-tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

function formatDateTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

function normalizeQuery(input: string): string {
  return String(input || "").trim();
}

function WorkspaceMembersPopover({ workspace }: { workspace: OrganizationWorkspace }) {
  const { t } = useTranslation(["common"]);
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [rawQ, setRawQ] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    const handle = window.setTimeout(() => setQ(normalizeQuery(rawQ)), 250);
    return () => window.clearTimeout(handle);
  }, [rawQ]);

  useEffect(() => {
    if (!open) return;
    setPage(1);
  }, [open, q]);

  const membersQuery = useQuery({
    queryKey: ["organization-workspace-members", workspace.workspaceId, page, q],
    enabled: open && workspace.memberCount > 0,
    queryFn: async () =>
      listOrganizationWorkspaceMembers(workspace.workspaceId, {
        page,
        size: 10,
        q,
      }),
    retry: false,
    meta: { silent: true },
  });

  const renderMember = (member: OrganizationWorkspaceMember) => {
    const primary = member.displayName || member.username || member.email || "U";
    return (
      <List.Item key={member.membershipId} className="py-2">
        <div className="flex w-full items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Avatar src={member.avatarUrl ?? undefined}>
              {primary.slice(0, 1).toUpperCase()}
            </Avatar>
            <div className="min-w-0">
              <div className="truncate font-medium">{primary}</div>
              <div className="truncate text-muted-foreground">{member.email || "-"}</div>
            </div>
          </div>
        </div>
      </List.Item>
    );
  };

  const content = (
    <div className="w-[420px] max-w-[85vw]">
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold">{t("common:ORG_WORKSPACES_MEMBERS_POPOVER_TITLE")}</div>
        <Tag color="blue" style={{ marginInlineEnd: 0 }}>
          {t("common:ORG_WORKSPACES_MEMBERS_COUNT", { count: workspace.memberCount })}
        </Tag>
      </div>

      <Input
        className="mt-3"
        allowClear
        value={rawQ}
        onChange={(event) => setRawQ(event.target.value)}
        prefix={<Search className="size-4 text-muted-foreground" />}
        placeholder={t("common:ORG_WORKSPACES_MEMBERS_SEARCH_PLACEHOLDER")}
      />

      <div className="mt-3">
        {membersQuery.isLoading ? (
          <div className="flex justify-center py-8">
            <Spin />
          </div>
        ) : membersQuery.isError ? (
          <div className="py-6 text-center">
            <div className="text-muted-foreground">{t("common:REQUEST_FAILED")}</div>
            <AntButton  className="mt-2" onClick={() => void membersQuery.refetch()}>
              {t("common:RETRY")}
            </AntButton>
          </div>
        ) : (
          <>
            <List

              dataSource={membersQuery.data?.items ?? []}
              locale={{ emptyText: t("common:EMPTY_DESC") }}
              renderItem={renderMember}
            />

            {(membersQuery.data?.pages || 0) > 1 ? (
              <div className="mt-3 flex justify-end">
                <Pagination

                  current={page}
                  total={membersQuery.data?.total || 0}
                  pageSize={membersQuery.data?.size || 10}
                  showSizeChanger={false}
                  onChange={(next) => setPage(next)}
                />
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );

  return (
    <Popover
      trigger="click"
      placement="bottomLeft"
      open={open}
      onOpenChange={(next) => setOpen(next)}
      content={content}
    >
      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-muted"
      >
        <Avatar.Group max={{ count: 4 }}>
          {workspace.membersPreview.map((member) => {
            const primary = member.displayName || member.username || member.email || "U";
            return (
              <Avatar key={member.userId} src={member.avatarUrl ?? undefined}>
                {primary.slice(0, 1).toUpperCase()}
              </Avatar>
            );
          })}
        </Avatar.Group>
        <span className="font-medium text-muted-foreground">
          {t("common:ORG_WORKSPACES_MEMBERS_COUNT", { count: workspace.memberCount })}
        </span>
      </button>
    </Popover>
  );
}

function WorkspacesTableSection(props: {
  columns: Array<ColumnDef<OrganizationWorkspace, unknown>>;
  tableHook: ReturnType<typeof useDataTable<OrganizationWorkspace>>;
  emptyTitle: string;
  emptyDescription: string;
  onRetry: () => void;
  t: (key: string) => string;
}) {
  const table = props.tableHook.table;
  const empty = !props.tableHook.isLoading && props.tableHook.items.length === 0;

  return (
    <PageState
      loading={props.tableHook.isLoading}
      error={props.tableHook.error}
      onRetry={props.onRetry}
      empty={empty}
      loadingVariant="table"
      emptyTitle={props.emptyTitle}
      emptyDescription={props.emptyDescription}
      className="py-4"
    >
      <div className="overflow-auto rounded-md border">
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
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {!table.getRowModel().rows.length ? (
              <TableRow>
                <TableCell className="h-20 text-center text-muted-foreground" colSpan={props.columns.length}>
                  {props.t("common:EMPTY_DESC")}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </PageState>
  );
}

export function OrganizationWorkspacesPage() {
  const { t } = useTranslation(["nav", "common"]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setCurrentWorkspaceId = useWorkspaceStore((s) => s.setCurrentWorkspaceId);

  const [tab, setTab] = useState<"active" | "archived">("active");
  const [createOpen, setCreateOpen] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState<OrganizationWorkspace | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<OrganizationWorkspace | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");

  const [form] = Form.useForm<{
    name: string;
    description?: string;
  }>();

  const invalidateWorkspaceTables = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["dataTable", "organization-workspaces-active"] }),
      queryClient.invalidateQueries({ queryKey: ["dataTable", "organization-workspaces-archived"] }),
    ]);
  };

  const createMutation = useMutation({
    mutationFn: async (payload: { name: string; description?: string }) =>
      createOrganizationWorkspace({
        name: payload.name,
        description: payload.description,
        template: "blank",
      }),
    onSuccess: async () => {
      notifySuccessText(t("common:ACTION_SUCCESS"));
      setCreateOpen(false);
      form.resetFields();
      await invalidateWorkspaceTables();
    },
    onError: (err) => notifyError(err),
  });

  const archiveMutation = useMutation({
    mutationFn: async (workspaceId: string) => archiveOrganizationWorkspace(workspaceId),
    onSuccess: async () => {
      notifySuccessText(t("common:ACTION_SUCCESS"));
      setConfirmArchive(null);
      await invalidateWorkspaceTables();
    },
    onError: (err) => notifyError(err),
  });

  const unarchiveMutation = useMutation({
    mutationFn: async (workspaceId: string) => unarchiveOrganizationWorkspace(workspaceId),
    onSuccess: async () => {
      notifySuccessText(t("common:ACTION_SUCCESS"));
      await invalidateWorkspaceTables();
    },
    onError: (err) => notifyError(err),
  });

  const deleteMutation = useMutation({
    mutationFn: async (payload: { workspaceId: string; confirmName: string }) =>
      deleteOrganizationWorkspace(payload.workspaceId, payload.confirmName),
    onSuccess: async () => {
      notifySuccessText(t("common:ACTION_SUCCESS"));
      setConfirmDelete(null);
      setDeleteConfirmName("");
      await invalidateWorkspaceTables();
    },
    onError: (err) => notifyError(err),
  });

  const columns = useMemo<Array<ColumnDef<OrganizationWorkspace, unknown>>>(
    () => [
      {
        id: "workspace",
        header: t("common:ORG_WORKSPACES_TABLE_WORKSPACE"),
        cell: ({ row }) => {
          const item = row.original;
          const menuItems: MenuProps["items"] = item.isArchived
            ? [
                {
                  key: "unarchive",
                  icon: <Undo2 className="size-4" />,
                  label: t("common:ORG_WORKSPACES_ACTION_UNARCHIVE"),
                  onClick: () => {
                    void unarchiveMutation.mutateAsync(item.workspaceId);
                  },
                },
                {
                  key: "delete",
                  danger: true,
                  icon: <Trash2 className="size-4" />,
                  label: t("common:ORG_WORKSPACES_ACTION_DELETE"),
                  onClick: () => {
                    setDeleteConfirmName("");
                    setConfirmDelete(item);
                  },
                },
              ]
            : [
                {
                  key: "archive",
                  icon: <Archive className="size-4" />,
                  label: t("common:ORG_WORKSPACES_ACTION_ARCHIVE"),
                  onClick: () => setConfirmArchive(item),
                },
                {
                  key: "delete",
                  danger: true,
                  icon: <Trash2 className="size-4" />,
                  label: t("common:ORG_WORKSPACES_ACTION_DELETE"),
                  onClick: () => {
                    setDeleteConfirmName("");
                    setConfirmDelete(item);
                  },
                },
              ];

          return (
            <div className="flex min-w-0 justify-center items-center gap-3">
              <Avatar shape="square" size={42} src={item.iconUrl ?? undefined}>
                {item.name.slice(0, 1).toUpperCase()}
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[15px] font-semibold">{item.name}</span>
                  <Tag style={{ marginInlineEnd: 0 }}>{item.slug}</Tag>
                  {item.isArchived ? (
                    <Tag color="default" style={{ marginInlineEnd: 0 }}>
                      {t("common:ORG_WORKSPACES_STATUS_ARCHIVED")}
                    </Tag>
                  ) : null}
                </div>
                <div className="truncate text-muted-foreground">
                  {item.description || t("common:ORG_WORKSPACES_DESCRIPTION_FALLBACK")}
                </div>
              </div>
              <Dropdown trigger={["click"]} menu={{ items: menuItems }}>
                <AntButton type="text" icon={<MoreVertical className="size-4" />} />
              </Dropdown>
            </div>
          );
        },
      },
      {
        id: "members",
        header: t("common:ORG_WORKSPACES_TABLE_MEMBERS"),
        cell: ({ row }) => <WorkspaceMembersPopover workspace={row.original} />,
      },
      {
        id: "createdAt",
        header: t("common:ORG_WORKSPACES_TABLE_CREATED_AT"),
        cell: ({ row }) => (
          <span className="text-muted-foreground">{formatDateTime(row.original.createdAt)}</span>
        ),
      },
      {
        id: "actions",
        header: t("common:ORG_WORKSPACES_TABLE_ACTIONS"),
        cell: ({ row }) => {
          const item = row.original;
          return (
            <AntButton
              type="link"
              disabled={item.isArchived}
              icon={<ArrowRight className="size-4" />}
              onClick={() => {
                setCurrentWorkspaceId(item.workspaceId);
                void navigate({ to: `/w/${item.workspaceId}` });
              }}
            >
              {t("common:ORG_WORKSPACES_ACTION_ENTER")}
            </AntButton>
          );
        },
      },
    ],
    [navigate, setCurrentWorkspaceId, t, unarchiveMutation],
  );

  const activeTableHook = useDataTable<OrganizationWorkspace>({
    tableId: "organization-workspaces-active",
    columns,
    initialState: { pageSize: 10 },
    fetcher: async (params) =>
      listOrganizationWorkspaces({
        page: params.page,
        size: params.size,
        q: params.q,
        archived: false,
      }),
    queryOptions: {
      staleTime: 30 * 1000,
      retry: false,
      meta: { silent: true },
    },
  });

  const archivedTableHook = useDataTable<OrganizationWorkspace>({
    tableId: "organization-workspaces-archived",
    columns,
    initialState: { pageSize: 10 },
    fetcher: async (params) =>
      listOrganizationWorkspaces({
        page: params.page,
        size: params.size,
        q: params.q,
        archived: true,
      }),
    queryOptions: {
      staleTime: 30 * 1000,
      retry: false,
      meta: { silent: true },
    },
  });

  const currentTableHook = tab === "active" ? activeTableHook : archivedTableHook;
  const deleteConfirmMatches = deleteConfirmName.trim() === (confirmDelete?.name || "");

  return (
    <DefaultPage
      width="full"
      title={t("nav:NAV_ORG_WORKSPACES")}
      description={t("common:ORG_WORKSPACES_DESC")}
      contentClassName="min-h-0"
      action={
        <AntButton
          type="primary"
          icon={<Plus size={16} />}
          onClick={() => {
            setCreateOpen(true);
          }}
        >
          {t("common:ORG_WORKSPACES_CREATE")}
        </AntButton>
      }
    >
      <ChromeTabs value={tab} onValueChange={(value) => setTab(value as "active" | "archived")}>
        <ChromeTabsBar
          left={
            <ChromeTabsList>
              <ChromeTabsTrigger value="active">{t("common:ORG_WORKSPACES_TAB_ACTIVE")}</ChromeTabsTrigger>
              <ChromeTabsTrigger value="archived">{t("common:ORG_WORKSPACES_TAB_ARCHIVED")}</ChromeTabsTrigger>
            </ChromeTabsList>
          }
          right={
            <Input.Search
              value={currentTableHook.searchInput}
              onChange={(event) => currentTableHook.setSearchInput(event.target.value)}
              placeholder={t("common:ORG_WORKSPACES_SEARCH_PLACEHOLDER")}
              allowClear
              style={{ width: 320 }}
            />
          }
        />

        <ChromeTabsContent value="active">
          <WorkspacesTableSection
            columns={columns}
            tableHook={activeTableHook}
            emptyTitle={t("common:ORG_WORKSPACES_ACTIVE_EMPTY_TITLE")}
            emptyDescription={t("common:ORG_WORKSPACES_ACTIVE_EMPTY_DESC")}
            onRetry={() => void activeTableHook.refetch()}
            t={t}
          />
        </ChromeTabsContent>

        <ChromeTabsContent value="archived">
          <WorkspacesTableSection
            columns={columns}
            tableHook={archivedTableHook}
            emptyTitle={t("common:ORG_WORKSPACES_ARCHIVED_EMPTY_TITLE")}
            emptyDescription={t("common:ORG_WORKSPACES_ARCHIVED_EMPTY_DESC")}
            onRetry={() => void archivedTableHook.refetch()}
            t={t}
          />
        </ChromeTabsContent>
      </ChromeTabs>

      <SettingDialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!createMutation.isPending) {
            setCreateOpen(open);
          }
        }}
        title={t("common:ORG_WORKSPACES_CREATE")}
        description={t("common:ORG_WORKSPACES_CREATE_DIALOG_DESC")}
        contentClassName="sm:max-w-[620px]"
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <AntButton onClick={() => setCreateOpen(false)} disabled={createMutation.isPending}>
              {t("common:CANCEL")}
            </AntButton>
            <AntButton
              type="primary"
              loading={createMutation.isPending}
              onClick={async () => {
                const values = await form.validateFields();
                await createMutation.mutateAsync(values);
              }}
            >
              {t("common:CONFIRM")}
            </AntButton>
          </div>
        }
      >
        <Form form={form} layout="vertical" requiredMark={false}>
          <Form.Item
            name="name"
            label={t("common:ORG_WORKSPACES_FIELD_NAME")}
            rules={[{ required: true, message: t("common:ORG_WORKSPACES_FIELD_NAME_REQUIRED") }]}
          >
            <Input placeholder={t("common:ORG_WORKSPACES_FIELD_NAME_PLACEHOLDER")} />
          </Form.Item>

          <Form.Item name="description" label={t("common:ORG_WORKSPACES_FIELD_DESCRIPTION")}>
            <Input.TextArea rows={3} placeholder={t("common:ORG_WORKSPACES_FIELD_DESCRIPTION_PLACEHOLDER")} />
          </Form.Item>
        </Form>
      </SettingDialog>

      <ConfirmDialog
        open={Boolean(confirmArchive)}
        onOpenChange={(open) => {
          if (!open) setConfirmArchive(null);
        }}
        title={t("common:ORG_WORKSPACES_ARCHIVE_CONFIRM_TITLE")}
        description={t("common:ORG_WORKSPACES_ARCHIVE_CONFIRM_DESC", {
          name: confirmArchive?.name || "",
        })}
        cancelText={t("common:CANCEL")}
        confirmText={t("common:ORG_WORKSPACES_ACTION_ARCHIVE")}
        danger
        loading={archiveMutation.isPending}
        onConfirm={async () => {
          if (!confirmArchive) return;
          await archiveMutation.mutateAsync(confirmArchive.workspaceId);
        }}
      />

      <SettingDialog
        open={Boolean(confirmDelete)}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) {
            setConfirmDelete(null);
            setDeleteConfirmName("");
          }
        }}
        title={t("common:ORG_WORKSPACES_DELETE_CONFIRM_TITLE")}
        description={t("common:ORG_WORKSPACES_DELETE_CONFIRM_DESC", {
          name: confirmDelete?.name || "",
        })}
        contentClassName="sm:max-w-[560px]"
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <AntButton
              disabled={deleteMutation.isPending}
              onClick={() => {
                setConfirmDelete(null);
                setDeleteConfirmName("");
              }}
            >
              {t("common:CANCEL")}
            </AntButton>
            <AntButton
              danger
              type="primary"
              loading={deleteMutation.isPending}
              disabled={!deleteConfirmMatches}
              onClick={async () => {
                if (!confirmDelete) return;
                await deleteMutation.mutateAsync({
                  workspaceId: confirmDelete.workspaceId,
                  confirmName: deleteConfirmName.trim(),
                });
              }}
            >
              {t("common:ORG_WORKSPACES_ACTION_DELETE")}
            </AntButton>
          </div>
        }
      >
        <div className="space-y-2">
          <label className="font-medium text-foreground" htmlFor="workspace-delete-confirm-name">
            {t("common:ORG_WORKSPACES_DELETE_CONFIRM_INPUT_LABEL", {
              name: confirmDelete?.name || "",
            })}
          </label>
          <Input
            id="workspace-delete-confirm-name"
            value={deleteConfirmName}
            onChange={(event) => setDeleteConfirmName(event.target.value)}
            placeholder={t("common:ORG_WORKSPACES_DELETE_CONFIRM_INPUT_PLACEHOLDER")}
            disabled={deleteMutation.isPending}
          />
        </div>
      </SettingDialog>
    </DefaultPage>
  );
}
