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
import { PageState } from "@/components/common/page-state";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { useDialogSnapshotState } from "@/pages/organization/team/shared/use-dialog-snapshot-state";
import { CreateRoleDialog, DeleteRoleDialog, PermissionEditDialog } from "./roles-dialogs";
import { RolesMatrixTable } from "./roles-matrix-table";
import { type DisplayOrganizationPermission, useOrganizationRolesDisplay } from "./roles-display";

export function OrganizationTeamRolesPage() {
  const { t } = useTranslation(["team", "common", "nav"]);
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [permissionDraft, setPermissionDraft] = useState<Record<string, boolean>>({});

  const deleteRoleDialog = useDialogSnapshotState<string>();
  const permissionDialog = useDialogSnapshotState<DisplayOrganizationPermission>();

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

  const savePermissionMutation = useMutation({
    mutationFn: async (permission: DisplayOrganizationPermission) => {
      const selectedRoleCodes = Object.entries(permissionDraft)
        .filter(([code, checked]) => checked && customRoleCodeSet.has(code))
        .map(([code]) => code);
      await setOrganizationPermissionRoles({
        permissionCode: permission.code,
        roleCodes: selectedRoleCodes,
      });
    },
    onSuccess: async () => {
      notifySuccessText(t("team:TEAM_ROLES_PERMISSION_SAVE_SUCCESS"));
      permissionDialog.close();
      await queryClient.invalidateQueries({ queryKey: ["organization", "rbac", "matrix"] });
    },
    onError: (err) => notifyError(err),
  });

  const openPermissionDialog = (permission: DisplayOrganizationPermission) => {
    const granted = new Set(permission.grantedRoleCodes);
    const draft: Record<string, boolean> = {};
    for (const role of displayRoles) {
      draft[role.code] = granted.has(role.code);
    }
    setPermissionDraft(draft);
    permissionDialog.openWith(permission);
  };

  if (matrixQuery.isLoading && !matrixQuery.data) {
    return (
      <DefaultPage
        width="full"
        title={t("nav:NAV_SETTINGS_TEAM_ROLES")}
        description={t("common:ORG_ROLES_DESC")}
      >
        <PageState loading loadingVariant="table" />
      </DefaultPage>
    );
  }

  if (matrixQuery.isError) {
    return (
      <DefaultPage
        width="full"
        title={t("nav:NAV_SETTINGS_TEAM_ROLES")}
        description={t("common:ORG_ROLES_DESC")}
      >
        <PageState
          loading={false}
          error={matrixQuery.error}
          onRetry={() => void matrixQuery.refetch()}
        />
      </DefaultPage>
    );
  }

  return (
    <DefaultPage
      width="full"
      title={t("nav:NAV_SETTINGS_TEAM_ROLES")}
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
          prefix={<Search className="h-4 w-4 text-muted-foreground" />}
          allowClear
        />

        <RolesMatrixTable
          filteredRoles={filteredRoles}
          filteredPermissions={filteredPermissions}
          onDeleteRole={(roleCode) => deleteRoleDialog.openWith(roleCode)}
          onPermissionEdit={openPermissionDialog}
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

      <PermissionEditDialog
        open={permissionDialog.open}
        onOpenChange={permissionDialog.onOpenChange}
        onCancel={permissionDialog.close}
        onConfirm={() => {
          const activePermission = permissionDialog.displayPayload;
          if (!activePermission) return;
          void savePermissionMutation.mutateAsync(activePermission);
        }}
        submitting={savePermissionMutation.isPending}
        permission={permissionDialog.displayPayload}
        displayRoles={displayRoles}
        permissionDraft={permissionDraft}
        onRoleCheckedChange={(roleCode, checked) => {
          setPermissionDraft((prev) => ({ ...prev, [roleCode]: checked }));
        }}
        t={t}
      />
    </DefaultPage>
  );
}
