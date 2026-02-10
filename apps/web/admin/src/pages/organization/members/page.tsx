import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { flexRender, type ColumnDef } from "@tanstack/react-table";
import { Avatar, Button as AntButton, Form, Input, Modal, Select, Tag } from "antd";
import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  deleteOrganizationMember,
  inviteOrganizationMember,
  listOrganizationMembers,
  patchOrganizationMemberRole,
  type OrgRole,
  type OrganizationMember,
} from "@/api/organization-members";
import { DefaultPage } from "@/components/common/default-page";
import { PageState } from "@/components/common/page-state";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { useDataTable } from "@/components/data-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { notifyError, notifySuccessText } from "@/lib/notifications";

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

const ROLE_OPTIONS: OrgRole[] = ["owner", "admin", "member"];

export function OrganizationMembersPage() {
  const { t } = useTranslation(["nav", "common", "team"]);
  const queryClient = useQueryClient();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm] = Form.useForm<{ email: string; role: OrgRole }>();
  const [pendingRemove, setPendingRemove] = useState<OrganizationMember | null>(null);

  const inviteMutation = useMutation({
    mutationFn: async (payload: { email: string; role: OrgRole }) => inviteOrganizationMember(payload),
    onSuccess: async () => {
      notifySuccessText(t("team:TEAM_INVITE_SUCCESS"));
      setInviteOpen(false);
      inviteForm.resetFields();
      await queryClient.invalidateQueries({ queryKey: ["dataTable", "organization-members"] });
    },
    onError: (err) => notifyError(err),
  });

  const roleMutation = useMutation({
    mutationFn: async (payload: { memberId: string; role: OrgRole }) =>
      patchOrganizationMemberRole(payload.memberId, { role: payload.role }),
    onSuccess: async () => {
      notifySuccessText(t("common:ACTION_SUCCESS"));
      await queryClient.invalidateQueries({ queryKey: ["dataTable", "organization-members"] });
    },
    onError: (err) => notifyError(err),
  });

  const removeMutation = useMutation({
    mutationFn: async (memberId: string) => deleteOrganizationMember(memberId),
    onSuccess: async () => {
      notifySuccessText(t("common:ACTION_SUCCESS"));
      setPendingRemove(null);
      await queryClient.invalidateQueries({ queryKey: ["dataTable", "organization-members"] });
    },
    onError: (err) => notifyError(err),
  });

  const columns = useMemo<Array<ColumnDef<OrganizationMember, unknown>>>(
    () => [
      {
        id: "member",
        header: t("common:ORG_MEMBERS_TABLE_MEMBER"),
        cell: ({ row }) => {
          const item = row.original;
          const primary = item.displayName || item.username;
          return (
            <div className="flex min-w-0 items-center gap-3">
              <Avatar src={item.avatarUrl ?? undefined}>
                {primary.slice(0, 1).toUpperCase()}
              </Avatar>
              <div className="min-w-0">
                <div className="truncate font-medium">{primary}</div>
                <div className="truncate text-xs text-muted-foreground">{item.email || "-"}</div>
              </div>
            </div>
          );
        },
      },
      {
        id: "role",
        header: t("common:ORG_MEMBERS_TABLE_ROLE"),
        cell: ({ row }) => {
          const item = row.original;
          return (
            <Select
              value={item.role}
              style={{ width: 140 }}
              options={ROLE_OPTIONS.map((option) => ({
                value: option,
                label: t(`common:ORG_ROLE_${option.toUpperCase()}`),
              }))}
              onChange={(next) => {
                void roleMutation.mutateAsync({ memberId: item.membershipId, role: next as OrgRole });
              }}
              disabled={roleMutation.isPending}
            />
          );
        },
      },
      {
        id: "status",
        header: t("common:ORG_MEMBERS_TABLE_STATUS"),
        cell: ({ row }) => {
          const item = row.original;
          return (
            <Tag color={item.status === "active" ? "green" : "default"} style={{ marginInlineEnd: 0 }}>
              {item.status}
            </Tag>
          );
        },
      },
      {
        id: "joined",
        header: t("common:ORG_MEMBERS_TABLE_JOINED_AT"),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{formatDateTime(row.original.joinedAt)}</span>
        ),
      },
      {
        id: "lastLogin",
        header: t("common:ORG_MEMBERS_TABLE_LAST_LOGIN"),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{formatDateTime(row.original.lastLoginAt)}</span>
        ),
      },
      {
        id: "actions",
        header: t("common:ORG_MEMBERS_TABLE_ACTIONS"),
        cell: ({ row }) => (
          <AntButton
            type="text"
            danger
            icon={<Trash2 className="size-4" />}
            onClick={() => setPendingRemove(row.original)}
          >
            {t("common:DELETE")}
          </AntButton>
        ),
      },
    ],
    [roleMutation, t],
  );

  const tableHook = useDataTable<OrganizationMember>({
    tableId: "organization-members",
    columns,
    initialState: { pageSize: 10 },
    fetcher: async (params) =>
      listOrganizationMembers({
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

  return (
    <DefaultPage
      width="full"
      title={t("nav:NAV_ORG_MEMBERS")}
      description={t("common:ORG_MEMBERS_DESC")}
      contentClassName="min-h-0"
      action={
        <AntButton
          type="primary"
          icon={<Plus size={16} />}
          onClick={() => {
            inviteForm.setFieldsValue({ role: "member" });
            setInviteOpen(true);
          }}
        >
          {t("common:ORG_MEMBERS_INVITE")}
        </AntButton>
      }
      extra={
        <Input.Search
          value={tableHook.searchInput}
          onChange={(e) => tableHook.setSearchInput(e.target.value)}
          placeholder={t("common:ORG_MEMBERS_SEARCH_PLACEHOLDER")}
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
                    {t("common:EMPTY_DESC")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </PageState>

      <Modal
        open={inviteOpen}
        title={t("common:ORG_MEMBERS_INVITE")}
        okText={t("common:CONFIRM")}
        cancelText={t("common:CANCEL")}
        confirmLoading={inviteMutation.isPending}
        onCancel={() => {
          if (!inviteMutation.isPending) setInviteOpen(false);
        }}
        onOk={async () => {
          const values = await inviteForm.validateFields();
          await inviteMutation.mutateAsync(values);
        }}
      >
        <Form form={inviteForm} layout="vertical" requiredMark={false}>
          <Form.Item
            name="email"
            label={t("common:ORG_MEMBERS_INVITE_EMAIL")}
            rules={[
              { required: true, message: t("common:ORG_MEMBERS_INVITE_EMAIL_REQUIRED") },
              { type: "email", message: t("team:TEAM_INVITE_VALIDATION_EMAIL_INVALID") },
            ]}
          >
            <Input placeholder={t("common:ORG_MEMBERS_INVITE_EMAIL_PLACEHOLDER")} />
          </Form.Item>

          <Form.Item
            name="role"
            label={t("common:ORG_MEMBERS_INVITE_ROLE")}
            rules={[{ required: true, message: t("common:ORG_MEMBERS_INVITE_ROLE_REQUIRED") }]}
          >
            <Select
              options={ROLE_OPTIONS.map((option) => ({
                value: option,
                label: t(`common:ORG_ROLE_${option.toUpperCase()}`),
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      <ConfirmDialog
        open={Boolean(pendingRemove)}
        onOpenChange={(open) => {
          if (!open) setPendingRemove(null);
        }}
        title={t("common:ORG_MEMBERS_REMOVE_CONFIRM_TITLE")}
        description={t("common:ORG_MEMBERS_REMOVE_CONFIRM_DESC", {
          name: pendingRemove?.displayName || pendingRemove?.username || "",
        })}
        cancelText={t("common:CANCEL")}
        confirmText={t("common:CONFIRM")}
        danger
        loading={removeMutation.isPending}
        onConfirm={async () => {
          if (!pendingRemove) return;
          await removeMutation.mutateAsync(pendingRemove.membershipId);
        }}
      />
    </DefaultPage>
  );
}
