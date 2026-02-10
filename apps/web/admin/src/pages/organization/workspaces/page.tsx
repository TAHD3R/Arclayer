import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { flexRender, type ColumnDef } from "@tanstack/react-table";
import { useNavigate } from "@tanstack/react-router";
import { Avatar, Button as AntButton, Card, Dropdown, Form, Input, Modal, Tag } from "antd";
import type { MenuProps } from "antd";
import { Check, FileText, Globe, MoreVertical, Newspaper, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";

import {
  createOrganizationWorkspace,
  deleteOrganizationWorkspace,
  listOrganizationWorkspaces,
  type OrganizationWorkspace,
  type OrganizationWorkspaceTemplate,
} from "@/api/organization-workspaces";
import { DefaultPage } from "@/components/common/default-page";
import { PageState } from "@/components/common/page-state";
import { useDataTable } from "@/components/data-table";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
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

const TEMPLATE_KEYS: OrganizationWorkspaceTemplate[] = ["blog", "website", "blank"];
const TEMPLATE_ICONS = {
  blog: Newspaper,
  website: Globe,
  blank: FileText,
} as const;

function formatDateTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

export function OrganizationWorkspacesPage() {
  const { t } = useTranslation(["nav", "common", "setup"]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setCurrentWorkspaceId = useWorkspaceStore((s) => s.setCurrentWorkspaceId);

  const [createOpen, setCreateOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<OrganizationWorkspace | null>(null);
  const [form] = Form.useForm<{
    name: string;
    description?: string;
    template: OrganizationWorkspaceTemplate;
  }>();
  const selectedTemplate = Form.useWatch("template", form) as
    | OrganizationWorkspaceTemplate
    | undefined;

  const createMutation = useMutation({
    mutationFn: async (payload: { name: string; description?: string; template: OrganizationWorkspaceTemplate }) =>
      createOrganizationWorkspace(payload),
    onSuccess: async () => {
      notifySuccessText(t("common:ACTION_SUCCESS"));
      setCreateOpen(false);
      form.resetFields();
      await queryClient.invalidateQueries({ queryKey: ["dataTable", "organization-workspaces"] });
    },
    onError: (err) => notifyError(err),
  });

  const deleteMutation = useMutation({
    mutationFn: async (workspaceId: string) => deleteOrganizationWorkspace(workspaceId),
    onSuccess: async () => {
      notifySuccessText(t("common:ACTION_SUCCESS"));
      setConfirmDelete(null);
      await queryClient.invalidateQueries({ queryKey: ["dataTable", "organization-workspaces"] });
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
          const menuItems: MenuProps["items"] = [
            {
              key: "enter",
              label: t("common:ORG_WORKSPACES_ACTION_ENTER"),
              onClick: () => {
                setCurrentWorkspaceId(item.workspaceId);
                void navigate({ to: `/w/${item.workspaceId}` });
              },
            },
            {
              key: "delete",
              danger: true,
              label: t("common:ORG_WORKSPACES_ACTION_DELETE"),
              onClick: () => setConfirmDelete(item),
            },
          ];

          return (
            <div className="flex min-w-0 items-start gap-3">
              <Avatar shape="square" size={40} src={item.iconUrl ?? undefined}>
                {item.name.slice(0, 1).toUpperCase()}
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{item.name}</span>
                  <Tag style={{ marginInlineEnd: 0 }}>{item.slug}</Tag>
                </div>
                <div className="truncate text-xs text-muted-foreground">
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
        cell: ({ row }) => {
          const item = row.original;
          return (
            <div className="flex items-center gap-2">
              <Avatar.Group max={{ count: 4 }}>
                {item.membersPreview.map((member) => (
                  <Avatar key={member.userId} src={member.avatarUrl ?? undefined}>
                    {(member.displayName || member.username || "U").slice(0, 1).toUpperCase()}
                  </Avatar>
                ))}
              </Avatar.Group>
              <span className="text-xs text-muted-foreground">{item.memberCount}</span>
            </div>
          );
        },
      },
      {
        id: "createdAt",
        header: t("common:ORG_WORKSPACES_TABLE_CREATED_AT"),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{formatDateTime(row.original.createdAt)}</span>
        ),
      },
    ],
    [navigate, setCurrentWorkspaceId, t],
  );

  const tableHook = useDataTable<OrganizationWorkspace>({
    tableId: "organization-workspaces",
    columns,
    initialState: { pageSize: 10 },
    fetcher: async (params) =>
      listOrganizationWorkspaces({
        page: params.page,
        size: params.size,
        q: params.q,
      }),
    queryOptions: {
      staleTime: 30 * 1000,
      retry: false,
      meta: { silent: true },
    },
  });

  const table = tableHook.table;
  const empty = !tableHook.isLoading && tableHook.items.length === 0;

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
            form.setFieldsValue({ template: "blank" });
            setCreateOpen(true);
          }}
        >
          {t("common:ORG_WORKSPACES_CREATE")}
        </AntButton>
      }
      extra={
        <Input.Search
          value={tableHook.searchInput}
          onChange={(e) => tableHook.setSearchInput(e.target.value)}
          placeholder={t("common:ORG_WORKSPACES_SEARCH_PLACEHOLDER")}
          allowClear
          style={{ maxWidth: 360 }}
        />
      }
    >
      <PageState
        loading={tableHook.isLoading}
        error={tableHook.error}
        onRetry={() => void tableHook.refetch()}
      >
        <div className="rounded-md border overflow-auto">
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
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell className="h-24 text-center text-muted-foreground" colSpan={columns.length}>
                    {empty ? t("common:EMPTY_DESC") : "-"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </PageState>

      <Modal
        open={createOpen}
        title={t("common:ORG_WORKSPACES_CREATE")}
        okText={t("common:CONFIRM")}
        cancelText={t("common:CANCEL")}
        onCancel={() => {
          if (!createMutation.isPending) setCreateOpen(false);
        }}
        confirmLoading={createMutation.isPending}
        onOk={async () => {
          const values = await form.validateFields();
          await createMutation.mutateAsync(values);
        }}
        width={820}
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

          <Form.Item
            name="template"
            label={t("common:ORG_WORKSPACES_FIELD_TEMPLATE")}
            rules={[{ required: true, message: t("common:ORG_WORKSPACES_FIELD_TEMPLATE_REQUIRED") }]}
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {TEMPLATE_KEYS.map((key) => {
                const Icon = TEMPLATE_ICONS[key];
                const selected = selectedTemplate === key;
                return (
                  <Card
                    key={key}
                    className={clsx(
                      "cursor-pointer border transition-all duration-200 shadow-xs hover:shadow-sm",
                      selected ? "border-primary bg-primary/7" : "border-border/70",
                    )}
                    cover={<div className="h-20 border-b border-border/50 bg-(--color-muted)/35" />}
                    onClick={() => form.setFieldValue("template", key)}
                    actions={[
                      <button
                        key={`${key}-action`}
                        type="button"
                        className={clsx(
                          "inline-flex cursor-pointer items-center gap-1 text-[14px] font-medium",
                          selected ? "text-primary" : undefined,
                        )}
                        onClick={(e) => {
                          e.preventDefault();
                          form.setFieldValue("template", key);
                        }}
                      >
                        <Icon size={16} />
                        <span>
                          {selected
                            ? t("setup:SETUP_TEMPLATE_SELECTED_ACTION")
                            : t("setup:SETUP_TEMPLATE_SELECT_ACTION")}
                        </span>
                        {selected ? <Check size={16} /> : null}
                      </button>,
                    ]}
                  >
                    <Card.Meta
                      title={<span className={clsx("font-semibold", selected ? "text-primary" : undefined)}>{t(`setup:SETUP_TEMPLATE_${key.toUpperCase()}_TITLE`)}</span>}
                      description={
                        <span className={clsx(selected ? "text-primary/85" : "text-(--color-muted-foreground)")}>
                          {t(`setup:SETUP_TEMPLATE_${key.toUpperCase()}_CARD_DESC`)}
                        </span>
                      }
                    />
                  </Card>
                );
              })}
            </div>
          </Form.Item>
        </Form>
      </Modal>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null);
        }}
        title={t("common:ORG_WORKSPACES_DELETE_CONFIRM_TITLE")}
        description={t("common:ORG_WORKSPACES_DELETE_CONFIRM_DESC", {
          name: confirmDelete?.name || "",
        })}
        cancelText={t("common:CANCEL")}
        confirmText={t("common:CONFIRM")}
        danger
        loading={deleteMutation.isPending}
        onConfirm={async () => {
          if (!confirmDelete) return;
          await deleteMutation.mutateAsync(confirmDelete.workspaceId);
        }}
      />
    </DefaultPage>
  );
}
