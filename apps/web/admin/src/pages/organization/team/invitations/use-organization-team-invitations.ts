import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { useDataTable } from "@/components/data-table";
import { useWorkspaceDateTimeFormatter } from "@/hooks/use-workspace-date-time-formatter";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import {
  type InviteOrganizationMemberFormValues,
  type InviteOrganizationRoleOption,
} from "@/pages/organization/team/shared/invite-organization-member-dialog";
import { getOrganizationRoleDisplayName } from "@/pages/organization/team/shared/role-i18n";
import { useDialogSnapshotState } from "@/pages/organization/team/shared/use-dialog-snapshot-state";
import { useOrganizationWorkspaceContext } from "@/pages/organization/team/shared/use-organization-workspace-context";

import {
  DEFAULT_RENEW_EXPIRES_IN_SECONDS,
  type OrgInvitationsTab,
  RENEW_OPTIONS,
  type RenewExpiresInSeconds,
} from "./invitations-constants";
import { useOrganizationInvitationColumns } from "./invitations-columns";

export function useOrganizationTeamInvitations() {
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
    DEFAULT_RENEW_EXPIRES_IN_SECONDS,
  );
  const [linkRoleCode, setLinkRoleCode] = useState<string>("member");
  const [linkExpiresInSeconds, setLinkExpiresInSeconds] = useState<RenewExpiresInSeconds>(
    DEFAULT_RENEW_EXPIRES_IN_SECONDS,
  );
  const [linkAllowedDomain, setLinkAllowedDomain] = useState<string>("");

  const renewInvitationDialog = useDialogSnapshotState<OrganizationInvitation>();
  const revokeInvitationDialog = useDialogSnapshotState<OrganizationInvitation>();
  const renewLinkDialog = useDialogSnapshotState<OrganizationInviteLink>();
  const disableLinkDialog = useDialogSnapshotState<OrganizationInviteLink>();

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

  const roleOptionItems = useMemo<InviteOrganizationRoleOption[]>(() => {
    const options = (rolesQuery.data?.items ?? []).map((role) => ({
      value: role.code,
      label: getOrganizationRoleDisplayName(t, role.code, role.name),
    }));
    if (options.length > 0) {
      return options;
    }

    return [
      { value: "owner", label: t("common:ORG_ROLE_OWNER") },
      { value: "admin", label: t("common:ORG_ROLE_ADMIN") },
      { value: "member", label: t("common:ORG_ROLE_MEMBER") },
    ];
  }, [rolesQuery.data?.items, t]);

  const defaultRoleCode = roleOptionItems.some((role) => role.value === "member")
    ? "member"
    : (roleOptionItems[0]?.value ?? "member");

  useEffect(() => {
    if (!roleOptionItems.some((item) => item.value === linkRoleCode)) {
      setLinkRoleCode(defaultRoleCode);
    }
  }, [defaultRoleCode, linkRoleCode, roleOptionItems]);

  const renewOptions = useMemo(
    () =>
      RENEW_OPTIONS.map((option) => ({
        value: option.value,
        label: t(option.key),
      })),
    [t],
  );

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
      await queryClient.invalidateQueries({
        queryKey: ["dataTable", "organization-invitations:pending"],
      });
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
      setLinkExpiresInSeconds(DEFAULT_RENEW_EXPIRES_IN_SECONDS);
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
      await queryClient.invalidateQueries({
        queryKey: ["dataTable", "organization-invitations:pending"],
      });
    },
    onError: (err) => notifyError(err),
  });

  const revokeInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) => revokeOrganizationInvitation(invitationId),
    onSuccess: async () => {
      notifySuccessText(t("team:TEAM_ACTION_SUCCESS"));
      revokeInvitationDialog.close();
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["dataTable", "organization-invitations:pending"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["dataTable", "organization-invitations:processed"],
        }),
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

  const openRenewInvitationDialog = useCallback(
    (invitation: OrganizationInvitation) => {
      setRenewExpiresInSeconds(DEFAULT_RENEW_EXPIRES_IN_SECONDS);
      renewInvitationDialog.openWith(invitation);
    },
    [renewInvitationDialog.openWith],
  );

  const openRevokeInvitationDialog = useCallback(
    (invitation: OrganizationInvitation) => {
      revokeInvitationDialog.openWith(invitation);
    },
    [revokeInvitationDialog.openWith],
  );

  const openRenewLinkDialog = useCallback(
    (link: OrganizationInviteLink) => {
      setRenewExpiresInSeconds(DEFAULT_RENEW_EXPIRES_IN_SECONDS);
      renewLinkDialog.openWith(link);
    },
    [renewLinkDialog.openWith],
  );

  const openDisableLinkDialog = useCallback(
    (link: OrganizationInviteLink) => {
      disableLinkDialog.openWith(link);
    },
    [disableLinkDialog.openWith],
  );

  const copyLinkText = useCallback(
    (text: string) => {
      void navigator.clipboard.writeText(text);
      notifySuccessText(t("team:TEAM_ACTION_COPIED"));
    },
    [t],
  );

  const { pendingColumns, processedColumns, linkColumns } = useOrganizationInvitationColumns({
    t,
    dateTime,
    roleNameByCode,
    onOpenRenewInvitation: openRenewInvitationDialog,
    onOpenRevokeInvitation: openRevokeInvitationDialog,
    onOpenRenewLink: openRenewLinkDialog,
    onOpenDisableLink: openDisableLinkDialog,
    onCopyLinkText: copyLinkText,
  });

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

  const submitInviteMembers = useCallback(
    async (values: InviteOrganizationMemberFormValues) => {
      await inviteMutation.mutateAsync(values);
    },
    [inviteMutation],
  );

  const renewInvitationById = useCallback(
    (invitationId: string) => {
      renewInvitationMutation.mutate(invitationId);
    },
    [renewInvitationMutation],
  );

  const revokeInvitationById = useCallback(
    (invitationId: string) => {
      revokeInvitationMutation.mutate(invitationId);
    },
    [revokeInvitationMutation],
  );

  const renewLinkById = useCallback(
    (linkId: string) => {
      renewLinkMutation.mutate(linkId);
    },
    [renewLinkMutation],
  );

  const disableLinkById = useCallback(
    (linkId: string) => {
      disableLinkMutation.mutate(linkId);
    },
    [disableLinkMutation],
  );

  const createLink = useCallback(() => {
    createLinkMutation.mutate();
  }, [createLinkMutation]);

  return {
    t,
    tab,
    setTab,
    pendingTable,
    processedTable,
    linksTable,
    inviteOpen,
    setInviteOpen,
    submitInviteMembers,
    invitePending: inviteMutation.isPending,
    roleOptionItems,
    defaultRoleCode,
    linkCreateOpen,
    setLinkCreateOpen,
    linkRoleCode,
    setLinkRoleCode,
    linkExpiresInSeconds,
    setLinkExpiresInSeconds,
    linkAllowedDomain,
    setLinkAllowedDomain,
    createLinkPending: createLinkMutation.isPending,
    createLink,
    renewOptions,
    renewExpiresInSeconds,
    setRenewExpiresInSeconds,
    renewInvitationDialog,
    renewInvitationPending: renewInvitationMutation.isPending,
    renewInvitationById,
    revokeInvitationDialog,
    revokeInvitationPending: revokeInvitationMutation.isPending,
    revokeInvitationById,
    renewLinkDialog,
    renewLinkPending: renewLinkMutation.isPending,
    renewLinkById,
    disableLinkDialog,
    disableLinkPending: disableLinkMutation.isPending,
    disableLinkById,
  };
}
