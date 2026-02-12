"use client";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Input } from "antd";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { Check, MoreVertical, Plus, Search, Trash2 } from "lucide-react";
import type { RbacMatrixPermissionRow } from "@/api/rbac";
import {
  createWorkspaceRoleFromTemplate,
  deleteWorkspaceRole,
  getWorkspaceRbacMatrix,
  setWorkspaceRolePermissions,
  setWorkspacePermissionRoles,
} from "@/api/rbac";
import { getAdminMenuCatalog } from "@/api/admin-menus";
import { DefaultPage } from "@/components/common/default-page";
import { PageState } from "@/components/common/page-state";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { useAuthStore } from "@/stores/use-auth-store";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { TeamRolesDialogs } from "./roles-dialogs";
import {
  collectMenuPermissionCodes,
  includesText,
  normalizeNeedle,
  sortByName,
} from "./roles-utils";
import type { CreateRoleFormValues } from "./roles-utils";
export function TeamRolesView(props: { workspaceIdOverride?: string | null } = {}) {
  const { t } = useTranslation(["team", "common", "settings"]);
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  const workspaceIdFromStore = useWorkspaceStore((s) => s.currentWorkspaceId);
  const workspaceId = props.workspaceIdOverride ?? workspaceIdFromStore;
  const [search, setSearch] = React.useState("");
  const needle = React.useMemo(() => normalizeNeedle(search), [search]);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<{ code: string; name: string } | null>(
    null,
  );
  const [permissionDialogOpen, setPermissionDialogOpen] = React.useState(false);
  const [activePermission, setActivePermission] = React.useState<RbacMatrixPermissionRow | null>(
    null,
  );
  const [permissionDraft, setPermissionDraft] = React.useState<Record<string, boolean>>({});
  const [menuScopeOpen, setMenuScopeOpen] = React.useState(false);
  const [menuScopeRoleCode, setMenuScopeRoleCode] = React.useState<string | null>(null);
  const [menuScopeDraft, setMenuScopeDraft] = React.useState<Record<string, boolean>>({});
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
  const menuCatalogQuery = useQuery({
    queryKey: ["workspace", "adminMenuCatalog", workspaceId],
    enabled: Boolean(accessToken && workspaceId && menuScopeOpen),
    queryFn: async () => {
      if (!workspaceId) throw new Error("workspaceId is required");
      return getAdminMenuCatalog(workspaceId);
    },
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });
  const roles = React.useMemo(() => sortByName(matrixQuery.data?.roles ?? []), [matrixQuery.data]);
  const permissions = React.useMemo(() => matrixQuery.data?.permissions ?? [], [matrixQuery.data]);
  const [showTopScrollbar, setShowTopScrollbar] = React.useState(false);
  const topScrollRef = React.useRef<HTMLDivElement | null>(null);
  const mainScrollRef = React.useRef<HTMLDivElement | null>(null);
  const scrollSpacerRef = React.useRef<HTMLDivElement | null>(null);
  const tableRef = React.useRef<HTMLTableElement | null>(null);
  const syncingRef = React.useRef<"top" | "main" | null>(null);
  React.useEffect(() => {
    const main = mainScrollRef.current;
    const spacer = scrollSpacerRef.current;
    const table = tableRef.current;
    if (!main || !spacer) return;
    const updateWidth = () => {
      // Match the scrollable content width so the top scrollbar reflects horizontal overflow.
      const contentWidth = table?.scrollWidth ?? main.scrollWidth;
      spacer.style.width = `${contentWidth}px`;
      setShowTopScrollbar(contentWidth > main.clientWidth + 1);
    };
    updateWidth();
    const ro = new ResizeObserver(() => updateWidth());
    ro.observe(main);
    if (table) ro.observe(table);
    window.addEventListener("resize", updateWidth);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", updateWidth);
    };
  }, [roles.length, permissions.length, needle]);
  const onTopScroll = React.useCallback(() => {
    const top = topScrollRef.current;
    const main = mainScrollRef.current;
    if (!top || !main) return;
    if (syncingRef.current === "main") return;
    syncingRef.current = "top";
    main.scrollLeft = top.scrollLeft;
    requestAnimationFrame(() => {
      if (syncingRef.current === "top") syncingRef.current = null;
    });
  }, []);
  const onMainScroll = React.useCallback(() => {
    const top = topScrollRef.current;
    const main = mainScrollRef.current;
    if (!top || !main) return;
    if (syncingRef.current === "top") return;
    syncingRef.current = "main";
    top.scrollLeft = main.scrollLeft;
    requestAnimationFrame(() => {
      if (syncingRef.current === "main") syncingRef.current = null;
    });
  }, []);
  // Search logic (smart filtering):
  // - If needle matches roles only: filter columns (roles) and keep all permission rows.
  // - If needle matches permissions only: filter rows (permissions) and keep all roles.
  // - If needle matches both: filter both.
  const matchedRoles = React.useMemo(() => {
    if (!needle) return roles;
    const hits = roles.filter((r) => includesText(r.name, needle));
    return hits;
  }, [needle, roles]);
  const matchedPermissions = React.useMemo(() => {
    if (!needle) return permissions;
    const hits = permissions.filter((p) => includesText(p.name, needle));
    return hits;
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
  const openPermissionDialog = React.useCallback(
    (permission: RbacMatrixPermissionRow) => {
      setActivePermission(permission);
      const granted = new Set(permission.grantedRoleCodes ?? []);
      const draft: Record<string, boolean> = {};
      for (const r of roles) {
        draft[r.code] = granted.has(r.code);
      }
      setPermissionDraft(draft);
      setPermissionDialogOpen(true);
    },
    [roles],
  );
  React.useEffect(() => {
    if (!permissionDialogOpen) {
      setActivePermission(null);
      setPermissionDraft({});
    }
  }, [permissionDialogOpen]);
  const customRoles = React.useMemo(() => roles.filter((r) => !r.isSystem), [roles]);
  const menuPermissionCodes = React.useMemo(() => {
    return collectMenuPermissionCodes(menuCatalogQuery.data?.items);
  }, [menuCatalogQuery.data?.items]);
  const currentRolePermissionSet = React.useMemo(() => {
    const roleCode = menuScopeRoleCode;
    if (!roleCode) return new Set<string>();
    const granted = permissions
      .filter((p) => (p.grantedRoleCodes ?? []).includes(roleCode))
      .map((p) => p.code);
    return new Set(granted);
  }, [menuScopeRoleCode, permissions]);
  React.useEffect(() => {
    if (!menuScopeOpen) {
      setMenuScopeRoleCode(null);
      setMenuScopeDraft({});
      return;
    }
    if (!menuScopeRoleCode && customRoles.length) {
      setMenuScopeRoleCode(customRoles[0].code);
    }
  }, [customRoles, menuScopeOpen, menuScopeRoleCode]);
  React.useEffect(() => {
    if (!menuScopeOpen) return;
    if (!menuScopeRoleCode) return;
    if (!menuPermissionCodes.size) {
      setMenuScopeDraft({});
      return;
    }
    const draft: Record<string, boolean> = {};
    for (const code of menuPermissionCodes) {
      draft[code] = currentRolePermissionSet.has(code);
    }
    setMenuScopeDraft(draft);
  }, [currentRolePermissionSet, menuPermissionCodes, menuScopeOpen, menuScopeRoleCode]);
  const savePermissionMutation = useMutation({
    mutationFn: async () => {
      if (!workspaceId) throw new Error("workspaceId is required");
      if (!activePermission) throw new Error("permission is required");
      const selected = Object.entries(permissionDraft)
        .filter(([, checked]) => Boolean(checked))
        .map(([code]) => code);
      // Only send custom roles; system roles are immutable.
      const customRoleCodes = new Set(roles.filter((r) => !r.isSystem).map((r) => r.code));
      const selectedCustom = selected.filter((code) => customRoleCodes.has(code));
      await setWorkspacePermissionRoles({
        workspaceId,
        permissionCode: activePermission.code,
        roleCodes: selectedCustom,
      });
    },
    onSuccess: async () => {
      notifySuccessText(t("team:TEAM_ROLES_PERMISSION_SAVE_SUCCESS"));
      setPermissionDialogOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["rbac", "matrix", workspaceId] });
    },
    onError: (err) => notifyError(err),
  });
  const saveMenuScopeMutation = useMutation({
    mutationFn: async () => {
      if (!workspaceId) throw new Error("workspaceId is required");
      if (!menuScopeRoleCode) throw new Error("roleCode is required");
      // Keep non-menu permissions unchanged; only replace the subset that appears in menu catalog.
      const selectedMenuPerms = Object.entries(menuScopeDraft)
        .filter(([, checked]) => Boolean(checked))
        .map(([code]) => code);
      const next = new Set<string>();
      for (const code of currentRolePermissionSet) {
        if (!menuPermissionCodes.has(code)) next.add(code);
      }
      for (const code of selectedMenuPerms) next.add(code);
      await setWorkspaceRolePermissions({
        workspaceId,
        roleCode: menuScopeRoleCode,
        permissionCodes: Array.from(next),
      });
    },
    onSuccess: async () => {
      notifySuccessText(t("team:TEAM_ROLES_MENU_SCOPE_SAVE_SUCCESS"));
      setMenuScopeOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["rbac", "matrix", workspaceId] });
    },
    onError: (err) => notifyError(err),
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
    defaultValues: {
      templateRoleCode: "__none__",
      name: "",
      description: "",
    },
    mode: "onSubmit",
  });
  const createErrors = createForm.formState.errors;
  React.useEffect(() => {
    if (!createOpen) {
      createForm.reset({
        templateRoleCode: "__none__",
        name: "",
        description: "",
      });
      return;
    }
    // Default to "no template" to keep UX lightweight.
    const current = createForm.getValues("templateRoleCode");
    if (!current) createForm.setValue("templateRoleCode", "__none__", { shouldDirty: false });
  }, [createForm, createOpen, roles]);
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
  if (!workspaceId) {
    return (
      <DefaultPage
        title={t("team:TEAM_ROLES_TITLE")}
        description={t("team:TEAM_ROLES_DESC")}
        width="fixed"
      >
        <PageState
          loading={false}
          empty
          emptyTitle={t("settings:SETTINGS_WORKSPACE_NOT_SELECTED_TITLE")}
          emptyDescription={t("settings:SETTINGS_WORKSPACE_NOT_SELECTED_DESC")}
        />
      </DefaultPage>
    );
  }
  if (matrixQuery.isLoading && !matrixQuery.data) {
    return (
      <DefaultPage
        title={t("team:TEAM_ROLES_TITLE")}
        description={t("team:TEAM_ROLES_DESC")}
        width="full"
      >
        <PageState loading loadingVariant="table" />
      </DefaultPage>
    );
  }
  if (matrixQuery.isError) {
    return (
      <DefaultPage
        title={t("team:TEAM_ROLES_TITLE")}
        description={t("team:TEAM_ROLES_DESC")}
        width="full"
      >
        <PageState
          loading={false}
          error={matrixQuery.error}
          onRetry={() => void matrixQuery.refetch()}
        />
      </DefaultPage>
    );
  }
  const hasEmptySearch = Boolean(needle) && (!filteredRoles.length || !filteredPermissions.length);
  return (
    <DefaultPage
      title={t("team:TEAM_ROLES_TITLE")}
      description={t("team:TEAM_ROLES_DESC")}
      width="full"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="w-full max-w-[520px]">
            <Input
              variant="borderless"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("team:TEAM_ROLES_SEARCH_PLACEHOLDER")}
              allowClear
              prefix={<Search className="h-4 w-4 text-muted-foreground" />}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => setMenuScopeOpen(true)}>
              {t("team:TEAM_ROLES_MENU_SCOPE_ACTION")}
            </Button>
            <Button
              type="primary"
              icon={<Plus className="h-4 w-4" />}
              onClick={() => setCreateOpen(true)}
            >
              {t("team:TEAM_ROLES_ADD_ROLE")}
            </Button>
          </div>
        </div>
        {hasEmptySearch ? (
          <PageState loading={false} empty emptyTitle={t("team:TEAM_ROLES_EMPTY_SEARCH")} />
        ) : (
          <div className="relative isolate rounded-lg border bg-card">
            {/* Top scrollbar to avoid having to scroll to the bottom to access horizontal scrolling. */}
            {showTopScrollbar ? (
              <div
                ref={topScrollRef}
                onScroll={onTopScroll}
                className="h-4 overflow-x-auto overflow-y-hidden border-b bg-card"
              >
                <div ref={scrollSpacerRef} className="h-1" />
              </div>
            ) : null}
            <div ref={mainScrollRef} onScroll={onMainScroll} className="max-h-[64vh] overflow-auto">
              <table
                ref={tableRef}
                className="w-full min-w-max caption-bottom text-sm [&_th]:whitespace-nowrap"
              >
                <TableHeader className="sticky top-0 z-[2] bg-card">
                  <TableRow>
                    <TableHead className="sticky left-0 z-[3] w-[360px] bg-card text-center">
                      {t("team:TEAM_ROLES_COL_PERMISSION")}
                    </TableHead>
                    {filteredRoles.map((role) => (
                      <TableHead key={role.code} className="min-w-[160px] text-center">
                        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                          <div />
                          <div className="min-w-0">
                            <div className="truncate font-medium text-foreground">{role.name}</div>
                          </div>
                          <div className="flex justify-end">
                            {!role.isSystem ? (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    type="button"
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                                    aria-label={t("team:TEAM_ACTION_DELETE")}
                                  >
                                    <MoreVertical className="h-4 w-4" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => {
                                      setDeleteTarget({ code: role.code, name: role.name });
                                      setDeleteOpen(true);
                                    }}
                                    disabled={deleteRoleMutation.isPending}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    {t("team:TEAM_ACTION_DELETE")}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            ) : null}
                          </div>
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPermissions.map((perm) => (
                    <TableRow key={perm.code}>
                      <TableCell className="sticky left-0 z-[1] w-90 bg-card">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-foreground">
                              {perm.name}
                            </div>
                            {perm.description ? (
                              <div className="mt-0.5 line-clamp-2 text-muted-foreground">
                                {perm.description}
                              </div>
                            ) : null}
                            {perm.pluginId && perm.pluginId !== "core" ? (
                              <div className="mt-1 text-xs text-muted-foreground bg-background border border-border p-1 rounded-md select-none">
                                {t("team:TEAM_ROLES_PERMISSION_PROVIDED_BY", {
                                  pluginName: perm.pluginName || perm.pluginId,
                                })}
                              </div>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <button
                              type="button"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                              onClick={() => openPermissionDialog(perm)}
                              aria-label={t("team:TEAM_ROLES_PERMISSION_ACTION")}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </TableCell>
                      {filteredRoles.map((role) => {
                        const granted = perm.grantedRoleCodes?.includes(role.code) ?? false;
                        return (
                          <TableCell key={`${perm.code}:${role.code}`} className="text-center">
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
        menuScopeOpen={menuScopeOpen}
        setMenuScopeOpen={setMenuScopeOpen}
        customRoles={customRoles}
        menuScopeRoleCode={menuScopeRoleCode}
        setMenuScopeRoleCode={setMenuScopeRoleCode}
        menuCatalogItems={menuCatalogQuery.data?.items ?? []}
        menuCatalogLoading={menuCatalogQuery.isLoading && !menuCatalogQuery.data}
        menuCatalogError={menuCatalogQuery.error}
        menuCatalogIsError={menuCatalogQuery.isError}
        onMenuCatalogRetry={() => void menuCatalogQuery.refetch()}
        menuScopeDraft={menuScopeDraft}
        setMenuScopeDraft={setMenuScopeDraft}
        saveMenuScopePending={saveMenuScopeMutation.isPending}
        onSaveMenuScope={() => saveMenuScopeMutation.mutate()}
        permissionDialogOpen={permissionDialogOpen}
        setPermissionDialogOpen={setPermissionDialogOpen}
        activePermission={activePermission}
        roles={roles}
        permissionDraft={permissionDraft}
        setPermissionDraft={setPermissionDraft}
        savePermissionPending={savePermissionMutation.isPending}
        onSavePermission={() => savePermissionMutation.mutate()}
        createOpen={createOpen}
        setCreateOpen={setCreateOpen}
        createForm={createForm}
        createErrors={createErrors}
        createRolePending={createRoleMutation.isPending}
        onCreateRoleSubmit={(values) => createRoleMutation.mutate(values)}
      />
    </DefaultPage>
  );
}
