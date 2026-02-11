import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button as AntButton, Input, Select } from "antd";
import { Check, MoreVertical, Plus, Search, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  createOrganizationRoleFromTemplate,
  deleteOrganizationRole,
  getOrganizationRbacMatrix,
  setOrganizationPermissionRoles,
  type OrganizationRbacMatrixPermissionRow,
} from "@/api/organization-rbac";
import { DefaultPage } from "@/components/common/default-page";
import { PageState } from "@/components/common/page-state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import {
  getOrganizationRoleDisplayDescription,
  getOrganizationRoleDisplayName,
} from "@/pages/organization/team/shared/role-i18n";
import { useDialogSnapshotState } from "@/pages/organization/team/shared/use-dialog-snapshot-state";

function includesText(haystack: string | null | undefined, needle: string): boolean {
  if (!needle) return true;
  return String(haystack || "").toLowerCase().includes(needle);
}

const ORG_PERMISSION_COPY_MAP: Record<string, { nameKey: string; descKey: string }> = {
  "org.members.read": {
    nameKey: "ORG_ROLE_PERMISSION_MEMBERS_VIEW",
    descKey: "ORG_ROLE_PERMISSION_MEMBERS_VIEW_DESC",
  },
  "org.members.manage": {
    nameKey: "ORG_ROLE_PERMISSION_MEMBERS_MANAGE",
    descKey: "ORG_ROLE_PERMISSION_MEMBERS_MANAGE_DESC",
  },
  "org.invitations.read": {
    nameKey: "ORG_ROLE_PERMISSION_INVITES_VIEW",
    descKey: "ORG_ROLE_PERMISSION_INVITES_VIEW_DESC",
  },
  "org.invitations.create": {
    nameKey: "ORG_ROLE_PERMISSION_INVITES_CREATE",
    descKey: "ORG_ROLE_PERMISSION_INVITES_CREATE_DESC",
  },
  "org.invitations.revoke": {
    nameKey: "ORG_ROLE_PERMISSION_INVITES_REVOKE",
    descKey: "ORG_ROLE_PERMISSION_INVITES_REVOKE_DESC",
  },
  "org.roles.read": {
    nameKey: "ORG_ROLE_PERMISSION_ROLES_VIEW",
    descKey: "ORG_ROLE_PERMISSION_ROLES_VIEW_DESC",
  },
  "org.roles.write": {
    nameKey: "ORG_ROLE_PERMISSION_ROLES_MANAGE",
    descKey: "ORG_ROLE_PERMISSION_ROLES_MANAGE_DESC",
  },
  "org.workspaces.read": {
    nameKey: "ORG_ROLE_PERMISSION_WORKSPACES_VIEW",
    descKey: "ORG_ROLE_PERMISSION_WORKSPACES_VIEW_DESC",
  },
  "org.workspaces.manage": {
    nameKey: "ORG_ROLE_PERMISSION_WORKSPACES_MANAGE",
    descKey: "ORG_ROLE_PERMISSION_WORKSPACES_MANAGE_DESC",
  },
  "org.settings.read": {
    nameKey: "ORG_ROLE_PERMISSION_SETTINGS_VIEW",
    descKey: "ORG_ROLE_PERMISSION_SETTINGS_VIEW_DESC",
  },
  "org.settings.manage": {
    nameKey: "ORG_ROLE_PERMISSION_SETTINGS_MANAGE",
    descKey: "ORG_ROLE_PERMISSION_SETTINGS_MANAGE_DESC",
  },
  "org.plugins.read": {
    nameKey: "ORG_ROLE_PERMISSION_PLUGINS_VIEW",
    descKey: "ORG_ROLE_PERMISSION_PLUGINS_VIEW_DESC",
  },
  "org.plugins.manage": {
    nameKey: "ORG_ROLE_PERMISSION_PLUGINS_MANAGE",
    descKey: "ORG_ROLE_PERMISSION_PLUGINS_MANAGE_DESC",
  },
  "org.activity.read": {
    nameKey: "ORG_ROLE_PERMISSION_ACTIVITY_VIEW",
    descKey: "ORG_ROLE_PERMISSION_ACTIVITY_VIEW_DESC",
  },
};

type DisplayOrganizationPermission = OrganizationRbacMatrixPermissionRow & {
  displayName: string;
  displayDescription: string | null;
};

type DisplayOrganizationRole = {
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
};

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

  const roles = useMemo(() => matrixQuery.data?.roles ?? [], [matrixQuery.data?.roles]);
  const permissions = useMemo(() => matrixQuery.data?.permissions ?? [], [matrixQuery.data?.permissions]);
  const customRoles = useMemo(() => roles.filter((role) => !role.isSystem), [roles]);
  const customRoleCodeSet = useMemo(() => new Set(customRoles.map((role) => role.code)), [customRoles]);

  const displayRoles = useMemo<DisplayOrganizationRole[]>(
    () =>
      roles.map((role) => ({
        code: role.code,
        name: getOrganizationRoleDisplayName(t, role.code, role.name),
        description: getOrganizationRoleDisplayDescription(t, role.code, role.description),
        isSystem: role.isSystem,
      })),
    [roles, t],
  );

  const displayPermissions = useMemo<DisplayOrganizationPermission[]>(
    () =>
      permissions.map((permission) => {
        const mapped = ORG_PERMISSION_COPY_MAP[permission.code];
        const displayName = mapped
          ? t(`common:${mapped.nameKey}`, { defaultValue: permission.name })
          : permission.name;
        const translatedDescription = mapped
          ? t(`common:${mapped.descKey}`, { defaultValue: permission.description ?? "" })
          : (permission.description ?? "");
        const displayDescription = translatedDescription.trim() ? translatedDescription : null;
        return {
          ...permission,
          displayName,
          displayDescription,
        };
      }),
    [permissions, t],
  );

  const needle = search.trim().toLowerCase();
  const filteredRoles = useMemo(
    () => displayRoles.filter((role) => includesText(role.name, needle) || includesText(role.code, needle)),
    [displayRoles, needle],
  );
  const filteredPermissions = useMemo(
    () =>
      displayPermissions.filter(
        (perm) =>
          includesText(perm.displayName, needle) ||
          includesText(perm.displayDescription, needle),
      ),
    [displayPermissions, needle],
  );

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
      <DefaultPage width="full" title={t("nav:NAV_SETTINGS_TEAM_ROLES")} description={t("common:ORG_ROLES_DESC")}>
        <PageState loading loadingVariant="table" />
      </DefaultPage>
    );
  }

  if (matrixQuery.isError) {
    return (
      <DefaultPage width="full" title={t("nav:NAV_SETTINGS_TEAM_ROLES")} description={t("common:ORG_ROLES_DESC")}>
        <PageState loading={false} error={matrixQuery.error} onRetry={() => void matrixQuery.refetch()} />
      </DefaultPage>
    );
  }

  return (
    <DefaultPage
      width="full"
      title={t("nav:NAV_SETTINGS_TEAM_ROLES")}
      description={t("common:ORG_ROLES_DESC")}
      action={
        <AntButton type="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
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

        <div className="rounded-lg border bg-card overflow-auto">
          <table className="w-full min-w-max text-sm [&_th]:whitespace-nowrap">
            <TableHeader className="sticky top-0 z-20 bg-card">
              <TableRow>
                <TableHead className="sticky left-0 z-30 w-[360px] bg-card text-center">
                  {t("team:TEAM_ROLES_COL_PERMISSION")}
                </TableHead>
                {filteredRoles.map((role) => (
                  <TableHead key={role.code} className="min-w-[160px] text-center">
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                      <div />
                      <div className="truncate font-medium text-foreground">{role.name}</div>
                      <div className="flex justify-end">
                        {role.isSystem ? null : (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => deleteRoleDialog.openWith(role.code)}
                              >
                                <Trash2 className="h-4 w-4" />
                                {t("team:TEAM_ACTION_DELETE")}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>

            <TableBody>
              {filteredPermissions.map((permission) => (
                <TableRow key={permission.code}>
                  <TableCell className="sticky left-0 z-10 w-90 bg-card">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-foreground">{permission.displayName}</div>
                        {permission.displayDescription ? (
                          <div className="mt-0.5 line-clamp-2 text-muted-foreground">{permission.displayDescription}</div>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                        onClick={() => openPermissionDialog(permission)}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </div>
                  </TableCell>

                  {filteredRoles.map((role) => {
                    const granted = permission.grantedRoleCodes.includes(role.code);
                    return (
                      <TableCell key={`${permission.code}:${role.code}`} className="text-center">
                        {granted ? (
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-muted">
                            <Check className="h-4 w-4 text-foreground" />
                          </span>
                        ) : null}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </table>
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-[640px]">
          <DialogHeader>
            <DialogTitle>{t("team:TEAM_ROLES_ADD_ROLE_DIALOG_TITLE")}</DialogTitle>
            <DialogDescription>{t("team:TEAM_ROLES_ADD_ROLE_DIALOG_DESC")}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <label className="font-semibold text-foreground">{t("team:TEAM_ROLES_FIELD_TEMPLATE")}</label>
              <div className="text-xs text-muted-foreground">{t("team:TEAM_ROLES_FIELD_TEMPLATE_HELP")}</div>
              <Select
                value={newRoleTemplateCode}
                onChange={(next) => setNewRoleTemplateCode(String(next))}
                options={displayRoles.map((role) => ({ value: role.code, label: role.name }))}
                placeholder={t("team:TEAM_ROLES_FIELD_TEMPLATE_PLACEHOLDER")}
                getPopupContainer={(node) => node.parentElement ?? document.body}
                style={{ width: "100%" }}
              />
            </div>

            <div className="grid gap-1.5">
              <label className="font-semibold text-foreground">{t("team:TEAM_ROLES_FIELD_NAME")}</label>
              <div className="text-xs text-muted-foreground">{t("team:TEAM_ROLES_FIELD_NAME_HELP")}</div>
              <Input
                value={newRoleName}
                onChange={(event) => setNewRoleName(event.target.value)}
                placeholder={t("team:TEAM_ROLES_FIELD_NAME")}
              />
            </div>

            <div className="grid gap-1.5">
              <label className="font-semibold text-foreground">{t("team:TEAM_ROLES_FIELD_DESC")}</label>
              <div className="text-xs text-muted-foreground">{t("team:TEAM_ROLES_FIELD_DESC_HELP")}</div>
              <Input.TextArea
                value={newRoleDesc}
                onChange={(event) => setNewRoleDesc(event.target.value)}
                autoSize={{ minRows: 3, maxRows: 6 }}
                placeholder={t("team:TEAM_ROLES_FIELD_DESC")}
              />
            </div>
          </div>

          <DialogFooter>
            <AntButton onClick={() => setCreateOpen(false)} disabled={createRoleMutation.isPending}>
              {t("common:CANCEL")}
            </AntButton>
            <AntButton
              type="primary"
              loading={createRoleMutation.isPending}
              onClick={() => createRoleMutation.mutate()}
              disabled={!newRoleName.trim()}
            >
              {t("common:CONFIRM")}
            </AntButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteRoleDialog.open} onOpenChange={deleteRoleDialog.onOpenChange}>
        <DialogContent className="max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{t("team:TEAM_ROLES_DELETE_TITLE")}</DialogTitle>
            <DialogDescription>
              {t("team:TEAM_ROLES_DELETE_DESC", {
                roleName: displayRoles.find((role) => role.code === deleteRoleDialog.displayPayload)?.name || "",
              })}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button onClick={deleteRoleDialog.close} disabled={deleteRoleMutation.isPending}>
              {t("common:CANCEL")}
            </Button>
            <AntButton
              danger
              type="primary"
              loading={deleteRoleMutation.isPending}
              onClick={() => {
                const roleCode = deleteRoleDialog.displayPayload;
                if (!roleCode) return;
                void deleteRoleMutation.mutateAsync(roleCode);
              }}
            >
              {t("team:TEAM_ACTION_DELETE")}
            </AntButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={permissionDialog.open} onOpenChange={permissionDialog.onOpenChange}>
        <DialogContent className="max-w-[680px]">
          <DialogHeader>
            <DialogTitle>
              {permissionDialog.displayPayload
                ? t("team:TEAM_ROLES_PERMISSION_DIALOG_TITLE", {
                    permissionName: permissionDialog.displayPayload.displayName,
                  })
                : ""}
            </DialogTitle>
            <DialogDescription>
              {permissionDialog.displayPayload?.displayDescription || t("team:TEAM_ROLES_PERMISSION_DIALOG_DESC")}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[420px] overflow-auto rounded-md border bg-card p-2">
            {displayRoles.length ? (
              displayRoles.map((role) => {
                const checked = Boolean(permissionDraft[role.code]);
                const disabled = role.isSystem;
                return (
                  <label
                    key={role.code}
                    className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-muted/50 data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-70"
                    data-disabled={disabled}
                  >
                    <Checkbox
                      checked={checked}
                      disabled={disabled}
                      onCheckedChange={(value) => {
                        setPermissionDraft((prev) => ({ ...prev, [role.code]: Boolean(value) }));
                      }}
                    />
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-foreground">
                        {role.name}
                        {role.isSystem ? (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            ({t("team:TEAM_ROLES_PERMISSION_READ_ONLY")})
                          </span>
                        ) : null}
                      </div>
                      {role.description ? (
                        <div className="mt-0.5 line-clamp-2 text-muted-foreground">{role.description}</div>
                      ) : null}
                    </div>
                  </label>
                );
              })
            ) : (
              <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                {t("team:TEAM_ROLES_PERMISSION_EMPTY_ROLES")}
              </div>
            )}
          </div>

          <DialogFooter>
            <AntButton onClick={permissionDialog.close} disabled={savePermissionMutation.isPending}>
              {t("common:CANCEL")}
            </AntButton>
            <AntButton
              type="primary"
              loading={savePermissionMutation.isPending}
              onClick={() => {
                const activePermission = permissionDialog.displayPayload;
                if (!activePermission) return;
                void savePermissionMutation.mutateAsync(activePermission);
              }}
            >
              {t("common:CONFIRM")}
            </AntButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DefaultPage>
  );
}
