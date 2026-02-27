import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button as AntButton, Input } from "antd";
import { Plus, Search } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  createOrganizationRoleFromTemplate,
  deleteOrganizationRole,
  getOrganizationRbacMatrix,
  setOrganizationPermissionRoles,
} from "@/api/organization-rbac";
import { DefaultPage } from "@/components/common/default-page";
import { ContentGuard } from "@/components/common/content-guard";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { useDialogSnapshotState } from "@/pages/organization/team/shared/hooks/use-dialog-snapshot-state";
import { CreateRoleDialog, DeleteRoleDialog } from "./roles-dialogs";
import { RolesMatrixTable } from "./roles-matrix-table";
import { useOrganizationRolesDisplay } from "../hooks/use-organization-roles-display";

export function OrganizationTeamRolesView() {
  const { t } = useTranslation(["team", "common", "nav"]);
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [togglingKey, setTogglingKey] = useState<string | null>(null);

  const deleteRoleDialog = useDialogSnapshotState<string>();

  const [newRoleTemplateCode, setNewRoleTemplateCode] = useState<string>("member");
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDesc, setNewRoleDesc] = useState("");

  const matrixQuery = useQuery({
    queryKey: ["organization", "rbac", "matrix"],
    queryFn: async () => getOrganizationRbacMatrix(),
    staleTime: 30 * 1000,
    retry: false,
  });

  const { displayRoles, filteredRoles, filteredPermissions, customRoleCodeSet } =
    useOrganizationRolesDisplay({
      roles: matrixQuery.data?.roles ?? [],
      permissions: matrixQuery.data?.permissions ?? [],
      search,
      t,
    });

  const createRoleMutation = useMutation({
    mutationFn: async () =>
      createOrganizationRoleFromTemplate({
        templateRoleCode: newRoleTemplateCode,
        name: newRoleName.trim(),
        description: newRoleDesc.trim() || null,
      }),
    onSuccess: async () => {
      notifySuccessText(t("team:TEAM_ROLES_CREATE_SUCCESS"));
      setCreateOpen(false);
      setNewRoleName("");
      setNewRoleDesc("");
      await queryClient.invalidateQueries({ queryKey: ["organization", "rbac", "matrix"] });
    },
    onError: (err) => notifyError(err),
  });

  const deleteRoleMutation = useMutation({
    mutationFn: async (roleCode: string) => deleteOrganizationRole(roleCode),
    onSuccess: async () => {
      notifySuccessText(t("team:TEAM_ROLES_DELETE_SUCCESS"));
      deleteRoleDialog.close();
      await queryClient.invalidateQueries({ queryKey: ["organization", "rbac", "matrix"] });
    },
    onError: (err) => notifyError(err),
  });

  const togglePermissionMutation = useMutation({
    mutationFn: async ({
      permissionCode,
      roleCode,
      granted,
    }: {
      permissionCode: string;
      roleCode: string;
      granted: boolean;
    }) => {
      const perm = filteredPermissions.find((p) => p.code === permissionCode);
      const currentCodes = new Set(perm?.grantedRoleCodes ?? []);
      if (granted) {
        currentCodes.add(roleCode);
      } else {
        currentCodes.delete(roleCode);
      }
      const roleCodes = Array.from(currentCodes).filter((c) => customRoleCodeSet.has(c));
      await setOrganizationPermissionRoles({ permissionCode, roleCodes });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["organization", "rbac", "matrix"] });
    },
    onError: (err) => notifyError(err),
    onSettled: () => setTogglingKey(null),
  });

  const handleTogglePermission = (permissionCode: string, roleCode: string, granted: boolean) => {
    setTogglingKey(`${permissionCode}:${roleCode}`);
    togglePermissionMutation.mutate({ permissionCode, roleCode, granted });
  };

  if (matrixQuery.isLoading && !matrixQuery.data) {
    return (
      <DefaultPage
        width="fixed"
        title={t("settings:SETTINGS_ORG_ROLES_TITLE")}
        description={t("common:ORG_ROLES_DESC")}
      >
        <ContentGuard loading loadingVariant="table" />
      </DefaultPage>
    );
  }

  if (matrixQuery.isError) {
    return (
      <DefaultPage
        width="fixed"
        title={t("settings:SETTINGS_ORG_ROLES_TITLE")}
        description={t("common:ORG_ROLES_DESC")}
      >
        <ContentGuard
          loading={false}
          error={matrixQuery.error}
          onRetry={() => void matrixQuery.refetch()}
        />
      </DefaultPage>
    );
  }

  return (
    <DefaultPage
      width="fixed"
      title={t("settings:SETTINGS_ORG_ROLES_TITLE")}
      description={t("common:ORG_ROLES_DESC")}
      action={
        <AntButton
          type="primary"
          icon={<Plus className="h-4 w-4" />}
          onClick={() => setCreateOpen(true)}
        >
          {t("team:TEAM_ROLES_ADD_ROLE")}
        </AntButton>
      }
    >
      <div className="space-y-4">
        <Input
          variant="borderless"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("team:TEAM_ROLES_SEARCH_PLACEHOLDER")}
          prefix={<Search className="h-4 w-4 text-label-secondary" />}
          allowClear
        />

        <RolesMatrixTable
          filteredRoles={filteredRoles}
          filteredPermissions={filteredPermissions}
          onDeleteRole={(roleCode) => deleteRoleDialog.openWith(roleCode)}
          onTogglePermission={handleTogglePermission}
          togglingKey={togglingKey}
          t={t}
        />
      </div>

      <CreateRoleDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCancel={() => setCreateOpen(false)}
        onConfirm={() => createRoleMutation.mutate()}
        submitting={createRoleMutation.isPending}
        templateRoleCode={newRoleTemplateCode}
        roleName={newRoleName}
        roleDescription={newRoleDesc}
        onTemplateRoleCodeChange={setNewRoleTemplateCode}
        onRoleNameChange={setNewRoleName}
        onRoleDescriptionChange={setNewRoleDesc}
        roleOptions={displayRoles.map((role) => ({ value: role.code, label: role.name }))}
        t={t}
      />

      <DeleteRoleDialog
        open={deleteRoleDialog.open}
        onOpenChange={deleteRoleDialog.onOpenChange}
        onCancel={deleteRoleDialog.close}
        onConfirm={() => {
          const roleCode = deleteRoleDialog.displayPayload;
          if (!roleCode) return;
          void deleteRoleMutation.mutateAsync(roleCode);
        }}
        roleName={
          displayRoles.find((role) => role.code === deleteRoleDialog.displayPayload)?.name || ""
        }
        submitting={deleteRoleMutation.isPending}
        t={t}
      />
    </DefaultPage>
  );
}
