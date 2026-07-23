"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ListFilter, Plus, RefreshCw, RotateCcw, Save } from "lucide-react";
import { z } from "zod";

import type {
  Permission,
  PermissionConditionSet,
  Role,
  RolePermissionGrant,
  WorkspacePermissionCatalog,
} from "@arclayer/openapi/admin-types";
import { ApiError } from "@arclayer/web/http";
import { Button } from "@arclayer/ui/button";
import { Filters, createFilter, type Filter, type FilterFieldConfig } from "@arclayer/ui/filters";

import {
  createWorkspaceRoleFromTemplate,
  deleteWorkspaceRole,
  getWorkspacePermissionCatalog,
  setWorkspaceRolePermissionsBatch,
  updateWorkspaceRole,
} from "@/api/rbac";
import { buildReuiFilterI18n } from "@/components/common/reui-filter-i18n";
import { DataTableSearchInput } from "@/components/common/data-table-search-input";
import { SettingsSectionAnchor } from "@/components/layout/settings-screen-provider";
import { useWorkspacePermissionAccess } from "@/hooks/use-workspace-permission-access";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

import type { CreateRoleFormValues, EditRoleFormValues } from "../utils";
import { normalizeNeedle } from "../utils";
import {
  buildGrantsByRole,
  diffCatalogDefinitions,
  grantsChanged,
  preserveCompatibleDraft,
  togglePermissionGrant,
  type PermissionCatalogDiff,
  type PermissionGrantsByRole,
} from "./permission-catalog-state";
import { PermissionConditionDialog } from "./permission-condition-dialog";
import { PermissionMatrix, type PermissionGroupSection } from "./permission-matrix";
import { TeamRolesDialogs } from "./roles-dialogs";

type CatalogFilters = { groupCode?: string; changedOnly?: boolean };
type ValidationTarget = { roleCode?: string; permissionCode?: string };

const CATALOG_STALE_TIME_MS = 30_000;
const FILTER_OPERATORS = [{ value: "is", labelKey: "common:FILTER_OPERATOR_IS" }] as const;

function catalogQueryKey(workspaceId: string | null) {
  return ["rbac", "catalog", workspaceId] as const;
}

function filtersToReui(value: CatalogFilters): Filter<string>[] {
  const filters: Filter<string>[] = [];
  if (value.groupCode) filters.push(createFilter("groupCode", "is", [value.groupCode]));
  if (value.changedOnly) filters.push(createFilter("changedOnly", "is", ["changed"]));
  return filters;
}

function filtersFromReui(filters: Filter<string>[]): CatalogFilters {
  const next: CatalogFilters = {};
  for (const filter of filters) {
    const first = filter.values[0];
    if (filter.field === "groupCode" && first) next.groupCode = first;
    if (filter.field === "changedOnly" && first === "changed") next.changedOnly = true;
  }
  return next;
}

function metaString(meta: unknown, ...keys: string[]): string | undefined {
  if (!meta || typeof meta !== "object") return undefined;
  for (const key of keys) {
    const value = (meta as Record<string, unknown>)[key];
    if (typeof value === "string") return value;
  }
  return undefined;
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
  const accessToken = useAuthStore((state) => state.accessToken);
  const workspaceIdFromStore = useWorkspaceStore((state) => state.currentWorkspaceId);
  const workspaceId = props.workspaceIdOverride ?? workspaceIdFromStore;
  const permissionAccess = useWorkspacePermissionAccess(workspaceId);
  const canReadRoles = permissionAccess.hasPermission("rbac:roles:read");
  const canReadPermissions = permissionAccess.hasPermission("rbac:permissions:read");
  const canManageRoles = permissionAccess.hasPermission("rbac:roles:write");

  const [search, setSearch] = React.useState("");
  const [filters, setFilters] = React.useState<CatalogFilters>({});
  const [baselineGrantsByRole, setBaselineGrantsByRole] = React.useState<PermissionGrantsByRole>(
    {},
  );
  const [draftGrantsByRole, setDraftGrantsByRole] = React.useState<PermissionGrantsByRole>({});
  const baselineRef = React.useRef(baselineGrantsByRole);
  const draftRef = React.useRef(draftGrantsByRole);
  const conditionalCatalogRef = React.useRef<WorkspacePermissionCatalog | null>(null);
  const appliedCatalogRef = React.useRef<WorkspacePermissionCatalog | null>(null);
  const [catalogDiff, setCatalogDiff] = React.useState<PermissionCatalogDiff | null>(null);
  const [validationTarget, setValidationTarget] = React.useState<ValidationTarget | null>(null);

  const [uncontrolledCreateOpen, setUncontrolledCreateOpen] = React.useState(false);
  const createOpen = props.createOpen ?? uncontrolledCreateOpen;
  const setCreateOpen = props.onCreateOpenChange ?? setUncontrolledCreateOpen;
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<{ code: string; name: string } | null>(
    null,
  );
  const [editingRole, setEditingRole] = React.useState<Role | null>(null);
  const [conditionTarget, setConditionTarget] = React.useState<{
    role: Role;
    permission: Permission;
  } | null>(null);

  const catalogQuery = useQuery({
    queryKey: catalogQueryKey(workspaceId),
    enabled: Boolean(accessToken && workspaceId && canReadRoles && canReadPermissions),
    queryFn: async () => {
      if (!workspaceId) throw new Error("workspaceId is required");
      const result = await getWorkspacePermissionCatalog({
        workspaceId,
        etag: conditionalCatalogRef.current?.etag,
      });
      if (result.status === "not-modified") {
        if (!conditionalCatalogRef.current) {
          throw new Error("Permission catalog returned 304 without a local baseline");
        }
        return conditionalCatalogRef.current;
      }
      conditionalCatalogRef.current = result.catalog;
      return result.catalog;
    },
    staleTime: CATALOG_STALE_TIME_MS,
    refetchOnMount: "always",
    refetchOnReconnect: "always",
    refetchOnWindowFocus: "always",
    retry: false,
  });

  const catalog = catalogQuery.data;
  const roles = React.useMemo(() => (catalog?.roles ?? []) as Role[], [catalog?.roles]);
  const permissions = React.useMemo(
    () => (catalog?.permissions ?? []) as Permission[],
    [catalog?.permissions],
  );

  React.useEffect(() => {
    if (!catalog) return;
    const nextBaseline = buildGrantsByRole(roles);
    const previousCatalog = appliedCatalogRef.current;
    const hadDraftChanges = roles.some(
      (role) =>
        !role.isSystem &&
        grantsChanged(baselineRef.current[role.code], draftRef.current[role.code]),
    );
    const nextDraft =
      previousCatalog && hadDraftChanges
        ? preserveCompatibleDraft(roles, permissions, draftRef.current)
        : nextBaseline;

    if (previousCatalog && hadDraftChanges) {
      const diff = diffCatalogDefinitions(previousCatalog, catalog);
      setCatalogDiff(diff.added.length || diff.changed.length || diff.removed.length ? diff : null);
    } else {
      setCatalogDiff(null);
    }
    setBaselineGrantsByRole(nextBaseline);
    setDraftGrantsByRole(nextDraft);
    baselineRef.current = nextBaseline;
    draftRef.current = nextDraft;
    appliedCatalogRef.current = catalog;
  }, [catalog, permissions, roles, workspaceId]);

  React.useEffect(() => {
    draftRef.current = draftGrantsByRole;
  }, [draftGrantsByRole]);

  const changedRoleCodes = React.useMemo(
    () =>
      roles
        .filter((role) => !role.isSystem)
        .filter((role) =>
          grantsChanged(baselineGrantsByRole[role.code], draftGrantsByRole[role.code]),
        )
        .map((role) => role.code),
    [baselineGrantsByRole, draftGrantsByRole, roles],
  );
  const changedRoleCodeSet = React.useMemo(() => new Set(changedRoleCodes), [changedRoleCodes]);

  const visibleRoles = React.useMemo(() => {
    const needle = normalizeNeedle(search);
    let result = roles;
    if (filters.changedOnly) result = result.filter((role) => changedRoleCodeSet.has(role.code));
    if (needle && roles.some((role) => normalizeNeedle(role.name).includes(needle))) {
      result = result.filter((role) => normalizeNeedle(role.name).includes(needle));
    }
    return result;
  }, [changedRoleCodeSet, filters.changedOnly, roles, search]);

  const visiblePermissions = React.useMemo(() => {
    const needle = normalizeNeedle(search);
    return permissions.filter((permission) => {
      if (filters.groupCode && permission.groupCode !== filters.groupCode) return false;
      if (filters.changedOnly) {
        const changedForPermission = changedRoleCodes.some((roleCode) => {
          const baseline = baselineGrantsByRole[roleCode] ?? [];
          const draft = draftGrantsByRole[roleCode] ?? [];
          const baselineGrant = baseline.find((grant) => grant.permissionCode === permission.code);
          const draftGrant = draft.find((grant) => grant.permissionCode === permission.code);
          return JSON.stringify(baselineGrant) !== JSON.stringify(draftGrant);
        });
        if (!changedForPermission) return false;
      }
      if (!needle) return true;
      return [
        permission.name,
        permission.description,
        permission.code,
        permission.ownerName,
        permission.groupName,
      ].some((value) => normalizeNeedle(String(value ?? "")).includes(needle));
    });
  }, [
    baselineGrantsByRole,
    changedRoleCodes,
    draftGrantsByRole,
    filters.changedOnly,
    filters.groupCode,
    permissions,
    search,
  ]);

  const groupSections = React.useMemo<PermissionGroupSection[]>(() => {
    if (!catalog) return [];
    return [...(catalog.groups ?? [])]
      .sort((left, right) => left.order - right.order)
      .map((group) => ({
        code: group.code,
        name: group.name,
        permissions: visiblePermissions.filter((permission) => permission.groupCode === group.code),
      }))
      .filter((group) => group.permissions.length > 0);
  }, [catalog, visiblePermissions]);

  const reconcileDependentCaches = React.useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["rbac", "roles", workspaceId] }),
      queryClient.invalidateQueries({
        queryKey: ["workspace-member-context", "roles", workspaceId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["workspace-member-context", "permissions", workspaceId],
      }),
      queryClient.invalidateQueries({ queryKey: ["team-invitations", workspaceId] }),
    ]);
  }, [queryClient, workspaceId]);

  const savePermissionsMutation = useMutation({
    mutationFn: async () => {
      if (!workspaceId || !catalog) throw new Error("Permission catalog is required");
      return setWorkspaceRolePermissionsBatch({
        workspaceId,
        request: {
          catalogRevision: catalog.catalogRevision,
          idempotencyKey: crypto.randomUUID(),
          roles: changedRoleCodes.map((roleCode) => {
            const role = roles.find((item) => item.code === roleCode);
            if (!role?.revision) throw new Error(`Role revision is missing for ${roleCode}`);
            return {
              roleCode,
              roleRevision: role.revision,
              permissionGrants: draftGrantsByRole[roleCode] ?? [],
            };
          }),
        },
      });
    },
    onSuccess: async (result) => {
      if (!catalog) return;
      const updatedByCode = new Map((result.roles ?? []).map((role) => [role.code, role]));
      const nextCatalog: WorkspacePermissionCatalog = {
        ...catalog,
        roles: (catalog.roles ?? []).map((role) => updatedByCode.get(role.code) ?? role),
      };
      const nextRoles = (nextCatalog.roles ?? []) as Role[];
      const nextBaseline = buildGrantsByRole(nextRoles);
      baselineRef.current = nextBaseline;
      draftRef.current = nextBaseline;
      setBaselineGrantsByRole(nextBaseline);
      setDraftGrantsByRole(nextBaseline);
      setCatalogDiff(null);
      setValidationTarget(null);
      conditionalCatalogRef.current = nextCatalog;
      appliedCatalogRef.current = nextCatalog;
      queryClient.setQueryData(catalogQueryKey(workspaceId), nextCatalog);
      await Promise.all([catalogQuery.refetch(), reconcileDependentCaches()]);
      notifySuccessText(
        t("team:TEAM_ROLES_PERMISSIONS_SAVE_SUCCESS", { count: changedRoleCodes.length }),
      );
    },
    onError: async (error) => {
      if (error instanceof ApiError) {
        setValidationTarget({
          roleCode: metaString(error.meta, "roleCode", "role_code"),
          permissionCode: metaString(error.meta, "permissionCode", "permission_code"),
        });
        if (
          error.error === "PERMISSION_CATALOG_CONFLICT" ||
          error.error === "ROLE_REVISION_CONFLICT"
        ) {
          await catalogQuery.refetch();
        }
      }
      notifyError(error);
    },
  });

  const deleteRoleMutation = useMutation({
    mutationFn: async (roleCode: string) => {
      if (!workspaceId) throw new Error("workspaceId is required");
      await deleteWorkspaceRole({ workspaceId, roleCode });
    },
    onSuccess: async () => {
      await Promise.all([catalogQuery.refetch(), reconcileDependentCaches()]);
      notifySuccessText(t("team:TEAM_ROLES_DELETE_SUCCESS"));
    },
    onError: notifyError,
  });

  const createSchema = React.useMemo(
    () =>
      z
        .object({
          templateRoleCode: z.string().min(1),
          name: z.string().min(1, t("team:TEAM_ROLES_FIELD_NAME")),
          description: z.string().optional().default(""),
        })
        .strict(),
    [t],
  );
  const createForm = useForm<CreateRoleFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { templateRoleCode: "__none__", name: "", description: "" },
    mode: "onSubmit",
  });
  const editSchema = React.useMemo(
    () =>
      z
        .object({
          name: z.string().min(1, t("team:TEAM_ROLES_FIELD_NAME")),
          description: z.string().optional().default(""),
        })
        .strict(),
    [t],
  );
  const editForm = useForm<EditRoleFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: { name: "", description: "" },
    mode: "onSubmit",
  });

  React.useEffect(() => {
    if (!createOpen) createForm.reset({ templateRoleCode: "__none__", name: "", description: "" });
  }, [createForm, createOpen]);
  React.useEffect(() => {
    editForm.reset({
      name: editingRole?.name ?? "",
      description: editingRole?.description ?? "",
    });
  }, [editForm, editingRole]);

  const createRoleMutation = useMutation({
    mutationFn: async (values: CreateRoleFormValues) => {
      if (!workspaceId) throw new Error("workspaceId is required");
      return createWorkspaceRoleFromTemplate({
        workspaceId,
        templateRoleCode: values.templateRoleCode === "__none__" ? null : values.templateRoleCode,
        name: values.name.trim(),
        description: values.description.trim() || null,
      });
    },
    onSuccess: async () => {
      setCreateOpen(false);
      await Promise.all([catalogQuery.refetch(), reconcileDependentCaches()]);
      notifySuccessText(t("team:TEAM_ROLES_CREATE_SUCCESS"));
    },
    onError: notifyError,
  });
  const editRoleMutation = useMutation({
    mutationFn: async (values: { roleCode: string; name: string; description: string }) => {
      if (!workspaceId) throw new Error("workspaceId is required");
      return updateWorkspaceRole({
        workspaceId,
        roleCode: values.roleCode,
        name: values.name.trim(),
        description: values.description.trim() || null,
      });
    },
    onSuccess: async () => {
      setEditingRole(null);
      await Promise.all([catalogQuery.refetch(), reconcileDependentCaches()]);
      notifySuccessText(t("team:TEAM_ROLES_UPDATE_SUCCESS"));
    },
    onError: notifyError,
  });

  const state = resolveGuardState({
    workspaceId,
    permissionAccess,
    canReadRoles,
    canReadPermissions,
    catalog,
    catalogQuery,
    t,
  });
  if (state) {
    return props.embedded ? (
      state
    ) : (
      <DefaultPage title={t("team:TEAM_ROLES_TITLE")} description={t("team:TEAM_ROLES_DESC")}>
        {state}
      </DefaultPage>
    );
  }

  const filterFields: FilterFieldConfig<string>[] = [
    {
      key: "groupCode",
      label: t("team:TEAM_ROLES_FILTER_GROUP"),
      type: "select",
      searchable: false,
      operators: FILTER_OPERATORS.map((operator) => ({
        value: operator.value,
        label: t(operator.labelKey),
      })),
      options: (catalog?.groups ?? []).map((group) => ({ value: group.code, label: group.name })),
    },
    {
      key: "changedOnly",
      label: t("team:TEAM_ROLES_FILTER_CHANGED"),
      type: "select",
      searchable: false,
      operators: FILTER_OPERATORS.map((operator) => ({
        value: operator.value,
        label: t(operator.labelKey),
      })),
      options: [{ value: "changed", label: t("team:TEAM_ROLES_FILTER_CHANGED_ONLY") }],
    },
  ];

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <DataTableSearchInput
        value={search}
        onChange={setSearch}
        placeholder={t("team:TEAM_ROLES_SEARCH_PLACEHOLDER")}
        clearLabel={t("common:CLEAR")}
        className="min-w-56 flex-1 sm:max-w-90"
      />
      <Filters
        filters={filtersToReui(filters)}
        fields={filterFields}
        onChange={(next) => setFilters(filtersFromReui(next))}
        i18n={buildReuiFilterI18n(t, t("team:TEAM_ROLES_FILTER_TITLE"))}
        allowMultiple={false}
        enableShortcut
        shortcutKey="f"
        shortcutLabel="F"
        trigger={
          <Button variant="outline" aria-label={t("team:TEAM_ROLES_FILTER_TITLE")}>
            <ListFilter className="size-4" />
          </Button>
        }
      />
      <Button
        variant="outline"
        size="icon"
        aria-label={t("common:REFRESH")}
        loading={catalogQuery.isFetching}
        onClick={() => void catalogQuery.refetch()}
      >
        <RefreshCw className="size-4" />
      </Button>
      <div className="ml-auto text-caption text-label-secondary">
        {t("team:TEAM_ROLES_CATALOG_REVISION", {
          revision: catalog?.catalogRevision.slice(0, 8) ?? "—",
        })}
      </div>
    </div>
  );

  const hasDraftChanges = changedRoleCodes.length > 0;
  const content = (
    <>
      <div className="flex flex-col gap-4 pb-8">
        {catalogDiff ? (
          <CatalogChangeNotice
            t={t}
            diff={catalogDiff}
            onKeep={() => setCatalogDiff(null)}
            onReload={() => {
              setDraftGrantsByRole(baselineGrantsByRole);
              setCatalogDiff(null);
              setValidationTarget(null);
            }}
          />
        ) : null}
        {hasDraftChanges ? (
          <div
            className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 lg:flex-row lg:items-center lg:justify-between"
            data-testid="team-roles-unsaved-permissions"
          >
            <div>
              <div className="text-callout font-semibold text-label-primary">
                {t("team:TEAM_ROLES_UNSAVED_TITLE")}
              </div>
              <div className="mt-0.5 text-footnote text-label-secondary">
                {t("team:TEAM_ROLES_UNSAVED_DESC", { count: changedRoleCodes.length })}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="ghost"
                disabled={savePermissionsMutation.isPending}
                onClick={() => {
                  setDraftGrantsByRole(baselineGrantsByRole);
                  setValidationTarget(null);
                }}
              >
                <RotateCcw className="size-4" />
                {t("team:TEAM_ROLES_REVERT_PERMISSIONS")}
              </Button>
              <Button
                loading={savePermissionsMutation.isPending}
                disabled={!canManageRoles || !changedRoleCodes.length}
                onClick={() => savePermissionsMutation.mutate()}
              >
                <Save className="size-4" />
                {t("team:TEAM_ROLES_SAVE_CHANGED", { count: changedRoleCodes.length })}
              </Button>
            </div>
          </div>
        ) : !canManageRoles ? (
          <div className="rounded-xl border border-border/70 bg-muted/25 px-4 py-3">
            <div className="text-callout font-semibold text-label-primary">
              {t("team:TEAM_ROLES_READONLY_TITLE")}
            </div>
            <div className="mt-0.5 text-footnote text-label-secondary">
              {t("team:TEAM_ROLES_READONLY_DESC")}
            </div>
          </div>
        ) : null}

        {!visibleRoles.length || !visiblePermissions.length ? (
          <ContentGuard loading={false} empty emptyTitle={t("team:TEAM_ROLES_EMPTY_SEARCH")} />
        ) : (
          <PermissionMatrix
            t={t}
            groups={groupSections}
            roles={visibleRoles}
            draftGrantsByRole={draftGrantsByRole}
            canManageRoles={canManageRoles}
            pending={
              savePermissionsMutation.isPending ||
              editRoleMutation.isPending ||
              deleteRoleMutation.isPending
            }
            validationTarget={validationTarget}
            onToggle={(roleCode, permissionCode, checked) =>
              setDraftGrantsByRole((current) => ({
                ...current,
                [roleCode]: togglePermissionGrant(current[roleCode], permissionCode, checked),
              }))
            }
            onEditConditions={(role, permission) => setConditionTarget({ role, permission })}
            onEditRole={setEditingRole}
            onDeleteRole={(role) => {
              setDeleteTarget({ code: role.code, name: role.name });
              setDeleteOpen(true);
            }}
          />
        )}
      </div>

      <PermissionConditionDialog
        t={t}
        open={Boolean(conditionTarget)}
        onOpenChange={(open) => {
          if (!open) setConditionTarget(null);
        }}
        role={conditionTarget?.role ?? null}
        permission={conditionTarget?.permission ?? null}
        templates={catalog?.conditionTemplates ?? []}
        conditionSets={resolveConditionSets(conditionTarget, draftGrantsByRole)}
        onSave={(conditionSets) => {
          if (!conditionTarget) return;
          setDraftGrantsByRole((current) => ({
            ...current,
            [conditionTarget.role.code]: setGrantConditions(
              current[conditionTarget.role.code],
              conditionTarget.permission.code,
              conditionSets,
            ),
          }));
        }}
      />
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
        createErrors={createForm.formState.errors}
        createRolePending={createRoleMutation.isPending}
        onCreateRoleSubmit={(values) => createRoleMutation.mutate(values)}
        editOpen={Boolean(editingRole)}
        setEditOpen={(nextOpen) => {
          const open = typeof nextOpen === "function" ? nextOpen(Boolean(editingRole)) : nextOpen;
          if (!open) setEditingRole(null);
        }}
        editForm={editForm}
        editErrors={editForm.formState.errors}
        editRolePending={editRoleMutation.isPending}
        onEditRoleSubmit={(values) => {
          if (!editingRole) return;
          editRoleMutation.mutate({ roleCode: editingRole.code, ...values });
        }}
        roles={roles}
      />
    </>
  );

  if (props.embedded) {
    return (
      <div className="flex min-h-0 flex-col gap-4">
        {toolbar}
        <SettingsSectionAnchor section="create-role" className="flex justify-end">
          <Button disabled={!canManageRoles} onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            {t("team:TEAM_ROLES_ADD_ROLE")}
          </Button>
        </SettingsSectionAnchor>
        {content}
      </div>
    );
  }

  return (
    <DefaultPage
      title={t("team:TEAM_ROLES_TITLE")}
      description={t("team:TEAM_ROLES_DESC")}
      action={
        <SettingsSectionAnchor section="create-role">
          <Button disabled={!canManageRoles} onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            {t("team:TEAM_ROLES_ADD_ROLE")}
          </Button>
        </SettingsSectionAnchor>
      }
      extra={toolbar}
    >
      {content}
    </DefaultPage>
  );
}

function resolveConditionSets(
  target: { role: Role; permission: Permission } | null,
  grantsByRole: PermissionGrantsByRole,
): PermissionConditionSet[] {
  if (!target) return [];
  return (
    grantsByRole[target.role.code]?.find((grant) => grant.permissionCode === target.permission.code)
      ?.conditionSets ?? []
  );
}

function setGrantConditions(
  grants: RolePermissionGrant[] | undefined,
  permissionCode: string,
  conditionSets: PermissionConditionSet[],
): RolePermissionGrant[] {
  return (grants ?? []).map((grant) =>
    grant.permissionCode === permissionCode ? Object.assign({}, grant, { conditionSets }) : grant,
  );
}

function CatalogChangeNotice(props: {
  t: ReturnType<typeof useTranslation>["t"];
  diff: PermissionCatalogDiff;
  onKeep: () => void;
  onReload: () => void;
}) {
  return (
    <div className="rounded-xl border border-amber-500/35 bg-amber-500/8 px-4 py-3">
      <div className="text-callout font-semibold text-label-primary">
        {props.t("team:TEAM_ROLES_CATALOG_CHANGED_TITLE")}
      </div>
      <div className="mt-1 text-footnote text-label-secondary">
        {props.t("team:TEAM_ROLES_CATALOG_CHANGED_DESC", {
          added: props.diff.added.length,
          changed: props.diff.changed.length,
          removed: props.diff.removed.length,
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={props.onKeep}>
          {props.t("team:TEAM_ROLES_CATALOG_KEEP_DRAFT")}
        </Button>
        <Button variant="ghost" size="sm" onClick={props.onReload}>
          {props.t("team:TEAM_ROLES_CATALOG_LOAD_SERVER")}
        </Button>
      </div>
    </div>
  );
}

function resolveGuardState(input: {
  workspaceId: string | null | undefined;
  permissionAccess: ReturnType<typeof useWorkspacePermissionAccess>;
  canReadRoles: boolean;
  canReadPermissions: boolean;
  catalog: WorkspacePermissionCatalog | undefined;
  catalogQuery: ReturnType<typeof useQuery<WorkspacePermissionCatalog>>;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  if (!input.workspaceId) {
    return (
      <ContentGuard
        loading={false}
        empty
        emptyTitle={input.t("settings:SETTINGS_WORKSPACE_NOT_SELECTED_TITLE")}
        emptyDescription={input.t("settings:SETTINGS_WORKSPACE_NOT_SELECTED_DESC")}
      />
    );
  }
  if (input.permissionAccess.authzQuery.isLoading && !input.permissionAccess.authzQuery.data) {
    return <ContentGuard loading loadingVariant="form" />;
  }
  if (input.permissionAccess.authzQuery.error) {
    return (
      <ContentGuard
        loading={false}
        error={input.permissionAccess.authzQuery.error}
        onRetry={() => void input.permissionAccess.authzQuery.refetch()}
      />
    );
  }
  if (!input.canReadRoles || !input.canReadPermissions) {
    return (
      <ContentGuard
        loading={false}
        empty
        emptyTitle={input.t("common:PAGE_FORBIDDEN_TITLE")}
        emptyDescription={input.t("common:PAGE_FORBIDDEN_DESC")}
      />
    );
  }
  if (input.catalogQuery.isLoading && !input.catalog) {
    return <ContentGuard loading loadingVariant="table" />;
  }
  if (input.catalogQuery.error) {
    return (
      <ContentGuard
        loading={false}
        error={input.catalogQuery.error}
        onRetry={() => void input.catalogQuery.refetch()}
      />
    );
  }
  return null;
}
