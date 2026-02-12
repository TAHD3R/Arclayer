import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button as AntButton, Input } from "antd";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  deleteOrganizationMember,
  inviteOrganizationMember,
  listOrganizationMembers,
  patchOrganizationMemberRole,
  type OrganizationMember,
} from "@/api/organization-members";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { DefaultPage } from "@/components/common/default-page";
import { PageState } from "@/components/common/page-state";
import { DataTablePresenter, useDataTable } from "@/components/data-table";
import { notifyError, notifySuccessText } from "@/lib/notifications";

import { InviteOrganizationMemberDialog } from "./invite-organization-member-dialog";
import { createOrganizationMembersColumns, ORG_ROLE_OPTIONS } from "./members-columns";

const TABLE_QUERY_KEY = ["dataTable", "organization-members"] as const;

export function OrganizationMembersPage() {
  const { t } = useTranslation(["nav", "common", "team"]);
  const queryClient = useQueryClient();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<OrganizationMember | null>(null);

  const inviteMutation = useMutation({
    mutationFn: async (payload: { email: string; role: "owner" | "admin" | "member" }) =>
      inviteOrganizationMember({
        email: payload.email,
        roleCode: payload.role,
      }),
    onSuccess: async () => {
      notifySuccessText(t("team:TEAM_INVITE_SUCCESS"));
      setInviteOpen(false);
      await queryClient.invalidateQueries({ queryKey: TABLE_QUERY_KEY });
    },
    onError: (error) => notifyError(error),
  });

  const roleMutation = useMutation({
    mutationFn: async (payload: { memberId: string; role: "owner" | "admin" | "member" }) =>
      patchOrganizationMemberRole(payload.memberId, { role: payload.role }),
    onSuccess: async () => {
      notifySuccessText(t("common:ACTION_SUCCESS"));
      await queryClient.invalidateQueries({ queryKey: TABLE_QUERY_KEY });
    },
    onError: (error) => notifyError(error),
  });

  const removeMutation = useMutation({
    mutationFn: async (memberId: string) => deleteOrganizationMember(memberId),
    onSuccess: async () => {
      notifySuccessText(t("common:ACTION_SUCCESS"));
      setPendingRemove(null);
      await queryClient.invalidateQueries({ queryKey: TABLE_QUERY_KEY });
    },
    onError: (error) => notifyError(error),
  });

  const roleOptions = useMemo(
    () =>
      ORG_ROLE_OPTIONS.map((role) => ({
        value: role,
        label: t(`common:ORG_ROLE_${role.toUpperCase()}`),
      })),
    [t],
  );

  const defaultRole = roleOptions.some((option) => option.value === "member")
    ? "member"
    : (roleOptions[0]?.value ?? "member");

  const columns = useMemo(
    () =>
      createOrganizationMembersColumns({
        t,
        roleOptions,
        roleUpdating: roleMutation.isPending,
        onRoleChange: ({ memberId, role }) => {
          void roleMutation.mutateAsync({ memberId, role });
        },
        onRemove: (member) => setPendingRemove(member),
      }),
    [roleMutation, roleOptions, t],
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
        ordering: params.ordering,
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
          onClick={() => setInviteOpen(true)}
        >
          {t("common:ORG_MEMBERS_INVITE")}
        </AntButton>
      }
      extra={
        <Input.Search
          className="max-w-[360px]"
          value={tableHook.searchInput}
          onChange={(event) => tableHook.setSearchInput(event.target.value)}
          placeholder={t("common:ORG_MEMBERS_SEARCH_PLACEHOLDER")}
          allowClear
        />
      }
    >
      <PageState
        loading={tableHook.isLoading}
        error={tableHook.error}
        onRetry={() => void tableHook.refetch()}
      >
        <DataTablePresenter table={table} emptyText={t("common:EMPTY_DESC")} />
      </PageState>

      <InviteOrganizationMemberDialog
        open={inviteOpen}
        loading={inviteMutation.isPending}
        defaultRole={defaultRole}
        roleOptions={roleOptions}
        t={t}
        onClose={() => setInviteOpen(false)}
        onSubmit={async (values) => {
          await inviteMutation.mutateAsync(values);
        }}
      />

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
