"use client";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuIconItem,
} from "@arclayer/ui/dropdown-menu";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import {
  createWorkspaceRoleFromTemplate,
  deleteWorkspaceRole,
  getWorkspaceRbacMatrix,
  setWorkspacePermissionRoles,
  updateWorkspaceRole,
} from "@/api/rbac";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { DataTableSearchInput } from "@/components/common/data-table-search-input";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@arclayer/ui/table";
import { Button } from "@arclayer/ui/button";
import { Checkbox } from "@arclayer/ui/checkbox";
import { Spinner } from "@arclayer/ui/spinner";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { useAuthStore } from "@/stores/use-auth-store";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { TeamRolesDialogs } from "./roles-dialogs";
import { includesText, normalizeNeedle, sortByName } from "../utils";
import type { CreateRoleFormValues, EditRoleFormValues } from "../utils";
import type { Role } from "@/types/api";

function resolveMatrixColumnWidths(roleCount: number) {
  const permissionWidth = 42;
  const roleWidth = roleCount > 0 ? Number(((100 - permissionWidth) / roleCount).toFixed(2)) : 0;
  return {
    permission: `${permissionWidth}%`,
    role: `${roleWidth}%`,
  };
}

function resolveRoleHeaderLines(roleName: string) {
  const normalized = roleName.trim();
  if (!normalized) return [];
  if (/\s/.test(normalized)) {
    return normalized.split(/\s+/).filter(Boolean);
  }
  if (/[\u3400-\u9fff]/.test(normalized) && normalized.length <= 6) {
    return normalized.split("");
  }
  return [normalized];
}

export function TeamRolesView(
  props: {
    workspaceIdOverride?: string | null;
    createOpen?: boolean;
    onCreateOpenChange?: (open: boolean) => void;
    embedded?: boolean;
  } = {},
) {
  const { t } = useTranslation(["team", "common", "settings"]);
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  const workspaceIdFromStore = useWorkspaceStore((s) => s.currentWorkspaceId);
  const workspaceId = props.workspaceIdOverride ?? workspaceIdFromStore;
  const [search, setSearch] = React.useState("");
  const needle = React.useMemo(() => normalizeNeedle(search), [search]);
  const [uncontrolledCreateOpen, setUncontrolledCreateOpen] = React.useState(false);
  const createOpen = props.createOpen ?? uncontrolledCreateOpen;
  const setCreateOpen = props.onCreateOpenChange ?? setUncontrolledCreateOpen;
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<{ code: string; name: string } | null>(
    null,
  );
  const [editingRole, setEditingRole] = React.useState<Role | null>(null);
  const [togglingKey, setTogglingKey] = React.useState<string | null>(null);

  const matrixQuery = useQuery({
    queryKey: ["rbac", "matrix", workspaceId],
    enabled: Boolean(accessToken && workspaceId),
    queryFn: async () => {
      if (!workspaceId) throw new Error("workspaceId is required");
      return getWorkspaceRbacMatrix(workspaceId);
    },
    staleTime: 30 * 1000,
    retry: false,
  });

  const roles = React.useMemo(() => sortByName(matrixQuery.data?.roles ?? []), [matrixQuery.data]);
  const permissions = React.useMemo(() => matrixQuery.data?.permissions ?? [], [matrixQuery.data]);

  const matchedRoles = React.useMemo(() => {
    if (!needle) return roles;
    return roles.filter((r) => includesText(r.name, needle));
  }, [needle, roles]);

  const matchedPermissions = React.useMemo(() => {
    if (!needle) return permissions;
    return permissions.filter((p) => includesText(p.name, needle));
  }, [needle, permissions]);

  const filteredRoles = React.useMemo(() => {
    if (!needle) return roles;
    const hasRoleHits = matchedRoles.length > 0;
    const hasPermHits = matchedPermissions.length > 0;
    if (hasRoleHits && !hasPermHits) return matchedRoles;
    if (!hasRoleHits && hasPermHits) return roles;
    if (hasRoleHits && hasPermHits) return matchedRoles;
    return [];
  }, [matchedPermissions.length, matchedRoles, needle, roles]);

  const filteredPermissions = React.useMemo(() => {
    if (!needle) return permissions;
    const hasRoleHits = matchedRoles.length > 0;
    const hasPermHits = matchedPermissions.length > 0;
    if (hasPermHits && !hasRoleHits) return matchedPermissions;
    if (!hasPermHits && hasRoleHits) return permissions;
    if (hasPermHits && hasRoleHits) return matchedPermissions;
    return [];
  }, [matchedPermissions, matchedRoles.length, needle, permissions]);
  const matrixColumnWidths = React.useMemo(
    () => resolveMatrixColumnWidths(filteredRoles.length),
    [filteredRoles.length],
  );

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
      if (!workspaceId) throw new Error("workspaceId is required");
      const perm = permissions.find((p) => p.code === permissionCode);
      const currentCodes = new Set(perm?.grantedRoleCodes ?? []);
      const customRoleCodes = new Set(roles.filter((r) => !r.isSystem).map((r) => r.code));
      if (granted) {
        currentCodes.add(roleCode);
      } else {
        currentCodes.delete(roleCode);
      }
      const roleCodes = Array.from(currentCodes).filter((c) => customRoleCodes.has(c));
      await setWorkspacePermissionRoles({ workspaceId, permissionCode, roleCodes });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["rbac", "matrix", workspaceId] });
    },
    onError: (err) => notifyError(err),
    onSettled: () => setTogglingKey(null),
  });

  const deleteRoleMutation = useMutation({
    mutationFn: async (roleCode: string) => {
      if (!workspaceId) throw new Error("workspaceId is required");
      await deleteWorkspaceRole({ workspaceId, roleCode });
    },
    onSuccess: async () => {
      notifySuccessText(t("team:TEAM_ROLES_DELETE_SUCCESS"));
      await queryClient.invalidateQueries({ queryKey: ["rbac", "matrix", workspaceId] });
    },
    onError: (err) => notifyError(err),
  });

  const createSchema = React.useMemo(() => {
    return z
      .object({
        templateRoleCode: z.string().min(1),
        name: z.string().min(1, t("team:TEAM_ROLES_FIELD_NAME")),
        description: z.string().optional().default(""),
      })
      .strict();
  }, [t]);

  const createForm = useForm<CreateRoleFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { templateRoleCode: "__none__", name: "", description: "" },
    mode: "onSubmit",
  });
  const createErrors = createForm.formState.errors;

  const editSchema = React.useMemo(() => {
    return z
      .object({
        name: z.string().min(1, t("team:TEAM_ROLES_FIELD_NAME")),
        description: z.string().optional().default(""),
      })
      .strict();
  }, [t]);

  const editForm = useForm<EditRoleFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: { name: "", description: "" },
    mode: "onSubmit",
  });
  const editErrors = editForm.formState.errors;

  React.useEffect(() => {
    if (!createOpen) {
      createForm.reset({ templateRoleCode: "__none__", name: "", description: "" });
      return;
    }
    const current = createForm.getValues("templateRoleCode");
    if (!current) createForm.setValue("templateRoleCode", "__none__", { shouldDirty: false });
  }, [createForm, createOpen, roles]);

  React.useEffect(() => {
    if (!editingRole) {
      editForm.reset({ name: "", description: "" });
      return;
    }
    editForm.reset({
      name: editingRole.name,
      description: editingRole.description ?? "",
    });
  }, [editForm, editingRole]);

  const createRoleMutation = useMutation({
    mutationFn: async (values: CreateRoleFormValues) => {
      if (!workspaceId) throw new Error("workspaceId is required");
      const tpl = values.templateRoleCode === "__none__" ? null : values.templateRoleCode;
      return createWorkspaceRoleFromTemplate({
        workspaceId,
        templateRoleCode: tpl,
        name: values.name.trim(),
        description: values.description.trim() ? values.description.trim() : null,
      });
    },
    onSuccess: async () => {
      notifySuccessText(t("team:TEAM_ROLES_CREATE_SUCCESS"));
      setCreateOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["rbac", "matrix", workspaceId] });
    },
    onError: (err) => notifyError(err),
  });

  const editRoleMutation = useMutation({
    mutationFn: async (values: { roleCode: string; name: string; description: string }) => {
      if (!workspaceId) throw new Error("workspaceId is required");
      return updateWorkspaceRole({
        workspaceId,
        roleCode: values.roleCode,
        name: values.name.trim(),
        description: values.description.trim() ? values.description.trim() : null,
      });
    },
    onSuccess: async () => {
      notifySuccessText(t("team:TEAM_ROLES_UPDATE_SUCCESS"));
      setEditingRole(null);
      await queryClient.invalidateQueries({ queryKey: ["rbac", "matrix", workspaceId] });
    },
    onError: (err) => notifyError(err),
  });

  if (!workspaceId) {
    const emptyState = (
      <ContentGuard
        loading={false}
        empty
        emptyTitle={t("settings:SETTINGS_WORKSPACE_NOT_SELECTED_TITLE")}
        emptyDescription={t("settings:SETTINGS_WORKSPACE_NOT_SELECTED_DESC")}
      />
    );
    return props.embedded ? (
      emptyState
    ) : (
      <DefaultPage title={t("team:TEAM_ROLES_TITLE")} description={t("team:TEAM_ROLES_DESC")}>
        {emptyState}
      </DefaultPage>
    );
  }

  if (matrixQuery.isLoading && !matrixQuery.data) {
    const loadingState = <ContentGuard loading loadingVariant="table" />;
    return props.embedded ? (
      loadingState
    ) : (
      <DefaultPage title={t("team:TEAM_ROLES_TITLE")} description={t("team:TEAM_ROLES_DESC")}>
        {loadingState}
      </DefaultPage>
    );
  }

  if (matrixQuery.isError) {
    const errorState = (
      <ContentGuard
        loading={false}
        error={matrixQuery.error}
        onRetry={() => void matrixQuery.refetch()}
      />
    );
    return props.embedded ? (
      errorState
    ) : (
      <DefaultPage title={t("team:TEAM_ROLES_TITLE")} description={t("team:TEAM_ROLES_DESC")}>
        {errorState}
      </DefaultPage>
    );
  }

  const hasEmptySearch = Boolean(needle) && (!filteredRoles.length || !filteredPermissions.length);

  const toolbar = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <DataTableSearchInput
        value={search}
        onChange={setSearch}
        placeholder={t("team:TEAM_ROLES_SEARCH_PLACEHOLDER")}
        clearLabel={t("common:CLEAR")}
        className="w-full max-w-90"
      />
      <div className="text-headline text-label-primary">
        {t("team:TEAM_ROLES_PERMISSION_COUNT", { count: filteredPermissions.length })}
      </div>
    </div>
  );

  const actionButton = (
    <Button onClick={() => setCreateOpen(true)}>
      <Plus className="h-4 w-4" />
      {t("team:TEAM_ROLES_ADD_ROLE")}
    </Button>
  );

  const content = (
    <>
      <div className="flex flex-col gap-4 pb-8">
        {hasEmptySearch ? (
          <ContentGuard loading={false} empty emptyTitle={t("team:TEAM_ROLES_EMPTY_SEARCH")} />
        ) : (
          <div className="relative isolate overflow-x-auto rounded-xl border border-border/70 bg-background">
            <table className="w-full table-fixed border-collapse caption-bottom text-callout">
              <colgroup>
                <col style={{ width: matrixColumnWidths.permission }} />
                {filteredRoles.map((role) => (
                  <col key={role.code} style={{ width: matrixColumnWidths.role }} />
                ))}
              </colgroup>
              <TableHeader className="border-b border-border/60 [&_tr]:border-0">
                <TableRow className="border-0 bg-background hover:bg-transparent">
                  <TableHead className="sticky top-0 left-0 z-[3] bg-background text-center">
                    <div className="flex min-h-24 items-center justify-center px-2 py-2.5 text-center">
                      <span className="block text-callout font-semibold text-label-secondary">
                        {t("team:TEAM_ROLES_COL_PERMISSION")}
                      </span>
                    </div>
                  </TableHead>
                  {filteredRoles.map((role) => {
                    const roleHeaderLines = resolveRoleHeaderLines(role.name);
                    return (
                      <TableHead
                        key={role.code}
                        className="sticky top-0 z-[2] min-w-[5.5rem] bg-background"
                      >
                        <div className="relative min-h-24 px-2 py-2.5">
                          <div
                            className="flex min-h-[4.5rem] items-center justify-center"
                            title={role.name}
                          >
                            <div className="flex min-w-0 flex-col items-center justify-center gap-0.5 text-center text-footnote font-semibold  text-label-primary">
                              {roleHeaderLines.map((line, index) => (
                                <span
                                  key={`${role.code}-${index}`}
                                  className="block whitespace-nowrap"
                                >
                                  {line}
                                </span>
                              ))}
                            </div>
                          </div>
                          {!role.isSystem ? (
                            <div className="absolute top-2.5 right-2 flex justify-end">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon-xs"
                                    aria-label={t("team:TEAM_USER_ACTIONS")}
                                  >
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuIconItem
                                    icon={<Pencil className="h-4 w-4" />}
                                    disabled={
                                      editRoleMutation.isPending || deleteRoleMutation.isPending
                                    }
                                    onSelect={() => setEditingRole(role)}
                                  >
                                    {t("team:TEAM_ACTION_EDIT")}
                                  </DropdownMenuIconItem>
                                  <DropdownMenuIconItem
                                    icon={<Trash2 className="h-4 w-4" />}
                                    variant="destructive"
                                    disabled={
                                      editRoleMutation.isPending || deleteRoleMutation.isPending
                                    }
                                    onSelect={() => {
                                      setDeleteTarget({ code: role.code, name: role.name });
                                      setDeleteOpen(true);
                                    }}
                                  >
                                    {t("team:TEAM_ACTION_DELETE")}
                                  </DropdownMenuIconItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          ) : null}
                        </div>
                      </TableHead>
                    );
                  })}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPermissions.map((perm) => (
                  <TableRow
                    key={perm.code}
                    className="group/row border-border/45 bg-background hover:bg-muted/20"
                  >
                    <TableCell className="sticky left-0 z-[1] bg-inherit transition-colors">
                      <div className="min-w-0 p-2">
                        <div className="break-words font-semibold text-label-primary">
                          {perm.name}
                        </div>
                        {perm.description ? (
                          <div className="mt-0.5 line-clamp-3 text-label-secondary">
                            {perm.description}
                          </div>
                        ) : null}
                        {perm.ownerKey && perm.ownerKey !== "core" ? (
                          <div className="mt-1 rounded-md border border-border bg-card p-1 text-caption text-label-secondary select-none">
                            {t("team:TEAM_ROLES_PERMISSION_PROVIDED_BY", {
                              ownerName: perm.ownerName || perm.ownerKey,
                            })}
                          </div>
                        ) : null}
                      </div>
                    </TableCell>
                    {filteredRoles.map((role) => {
                      const granted = perm.grantedRoleCodes?.includes(role.code) ?? false;
                      const key = `${perm.code}:${role.code}`;
                      return (
                        <TableCell key={key} className="px-2 py-2 text-center">
                          <div className="flex justify-center">
                            {togglingKey === key ? (
                              <Spinner className="size-4" />
                            ) : (
                              <Checkbox
                                checked={granted}
                                disabled={role.isSystem}
                                onCheckedChange={(checked) => {
                                  setTogglingKey(key);
                                  togglePermissionMutation.mutate({
                                    permissionCode: perm.code,
                                    roleCode: role.code,
                                    granted: Boolean(checked),
                                  });
                                }}
                              />
                            )}
                          </div>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </table>
          </div>
        )}
      </div>

      <TeamRolesDialogs
        t={t}
        deleteOpen={deleteOpen}
        setDeleteOpen={setDeleteOpen}
        deleteTarget={deleteTarget}
        setDeleteTarget={setDeleteTarget}
        deleteRolePending={deleteRoleMutation.isPending}
        onDeleteRoleConfirm={(roleCode) => deleteRoleMutation.mutateAsync(roleCode)}
        createOpen={createOpen}
        setCreateOpen={setCreateOpen}
        createForm={createForm}
        createErrors={createErrors}
        createRolePending={createRoleMutation.isPending}
        onCreateRoleSubmit={(values) => createRoleMutation.mutate(values)}
        editOpen={Boolean(editingRole)}
        setEditOpen={(open) => {
          if (!open) setEditingRole(null);
        }}
        editForm={editForm}
        editErrors={editErrors}
        editRolePending={editRoleMutation.isPending}
        onEditRoleSubmit={(values) => {
          if (!editingRole) return;
          editRoleMutation.mutate({
            roleCode: editingRole.code,
            ...values,
          });
        }}
        roles={roles}
      />
    </>
  );

  if (props.embedded) {
    return (
      <div className="flex min-h-0 flex-col gap-4">
        {toolbar}
        {content}
      </div>
    );
  }

  return (
    <DefaultPage
      title={t("team:TEAM_ROLES_TITLE")}
      description={t("team:TEAM_ROLES_DESC")}
      action={actionButton}
      extra={toolbar}
    >
      {content}
    </DefaultPage>
  );
}
