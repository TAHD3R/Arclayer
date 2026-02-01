"use client";

import * as React from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Input, Modal, Select } from "antd";
import { z } from "zod";
import { Controller, useForm } from "react-hook-form";
import { Check, MoreVertical, Plus, Search, Trash2 } from "lucide-react";

import type { Role, RbacMatrixPermissionRow } from "@/api/rbac";
import {
  createWorkspaceRoleFromTemplate,
  deleteWorkspaceRole,
  getWorkspaceRbacMatrix,
  setWorkspacePermissionRoles,
} from "@/api/rbac";
import { DefaultPage } from "@/components/app/defaultPage";
import { PageState } from "@/components/app/pageState";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/animate-ui/components/radix/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { zodResolver } from "@/lib/forms/zodResolver";
import { notifyError, notifySuccessText } from "@/utils/notifications";

function normalizeNeedle(input: string): string {
  return String(input || "")
    .trim()
    .toLowerCase();
}

function includesText(haystack: string | null | undefined, needle: string): boolean {
  if (!needle) return true;
  const s = String(haystack || "").toLowerCase();
  return s.includes(needle);
}

function sortByName(roles: Role[]): Role[] {
  return [...roles].sort((a, b) => a.name.localeCompare(b.name));
}

type CreateRoleFormValues = {
  templateRoleCode: string;
  name: string;
  description: string;
};

export function TeamRolesView() {
  const { t } = useTranslation(["team", "common", "settings"]);

  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);

  const [search, setSearch] = React.useState("");
  const needle = React.useMemo(() => normalizeNeedle(search), [search]);

  const [createOpen, setCreateOpen] = React.useState(false);

  const [permissionDialogOpen, setPermissionDialogOpen] = React.useState(false);
  const [activePermission, setActivePermission] = React.useState<RbacMatrixPermissionRow | null>(
    null,
  );
  const [permissionDraft, setPermissionDraft] = React.useState<Record<string, boolean>>({});

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

  const [showTopScrollbar, setShowTopScrollbar] = React.useState(false);
  const topScrollRef = React.useRef<HTMLDivElement | null>(null);
  const mainScrollRef = React.useRef<HTMLDivElement | null>(null);
  const scrollSpacerRef = React.useRef<HTMLDivElement | null>(null);
  const syncingRef = React.useRef<"top" | "main" | null>(null);

  React.useEffect(() => {
    const main = mainScrollRef.current;
    const spacer = scrollSpacerRef.current;
    if (!main || !spacer) return;

    const updateWidth = () => {
      // Match the scrollable content width so the top scrollbar reflects horizontal overflow.
      spacer.style.width = `${main.scrollWidth}px`;
      setShowTopScrollbar(main.scrollWidth > main.clientWidth + 1);
    };

    updateWidth();

    const ro = new ResizeObserver(() => updateWidth());
    ro.observe(main);
    return () => ro.disconnect();
  }, [matrixQuery.data?.roles?.length, matrixQuery.data?.permissions?.length]);

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

          <Button
            type="primary"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => setCreateOpen(true)}
          >
            {t("team:TEAM_ROLES_ADD_ROLE")}
          </Button>
        </div>

        {hasEmptySearch ? (
          <PageState loading={false} empty emptyTitle={t("team:TEAM_ROLES_EMPTY_SEARCH")} />
        ) : (
          <div className="rounded-lg border bg-card">
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
              <Table className="min-w-max [&_th]:whitespace-nowrap">
                <TableHeader className="sticky top-0 z-20 bg-card">
                  <TableRow>
                    <TableHead className="sticky left-0 z-30 w-[360px] bg-card text-center">
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
                                      Modal.confirm({
                                        title: t("team:TEAM_ROLES_DELETE_TITLE"),
                                        content: t("team:TEAM_ROLES_DELETE_DESC", {
                                          roleName: role.name,
                                        }),
                                        okText: t("team:TEAM_ACTION_DELETE"),
                                        cancelText: t("common:CANCEL"),
                                        okButtonProps: { danger: true },
                                        onOk: async () => {
                                          await deleteRoleMutation.mutateAsync(role.code);
                                        },
                                      });
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
                      <TableCell className="sticky left-0 z-10 w-[360px] bg-card">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate font-medium text-foreground">{perm.name}</div>
                            {perm.description ? (
                              <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                                {perm.description}
                              </div>
                            ) : null}
                            {perm.pluginId && perm.pluginId !== "core" ? (
                              <div className="mt-1 text-xs text-muted-foreground">
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
              </Table>
            </div>
          </div>
        )}
      </div>

      {/* Permission dialog */}
      <Dialog open={permissionDialogOpen} onOpenChange={setPermissionDialogOpen}>
        <DialogContent className="max-w-[560px]">
          <DialogHeader>
            <DialogTitle>
              {t("team:TEAM_ROLES_PERMISSION_DIALOG_TITLE", {
                permissionName: activePermission?.name ?? "",
              })}
            </DialogTitle>
            <DialogDescription>{t("team:TEAM_ROLES_PERMISSION_DIALOG_DESC")}</DialogDescription>
          </DialogHeader>

          <div className="flex max-h-[420px] flex-col gap-2 overflow-auto py-2">
            {roles.map((role) => {
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
                    onCheckedChange={(v) => {
                      setPermissionDraft((prev) => ({ ...prev, [role.code]: Boolean(v) }));
                    }}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-foreground">{role.name}</span>
                    </div>
                    {role.description ? (
                      <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {role.description}
                      </div>
                    ) : null}
                  </div>
                </label>
              );
            })}
          </div>

          <DialogFooter>
            <Button
              onClick={() => setPermissionDialogOpen(false)}
              disabled={savePermissionMutation.isPending}
            >
              {t("common:CANCEL")}
            </Button>
            <Button
              type="primary"
              onClick={() => savePermissionMutation.mutate()}
              loading={savePermissionMutation.isPending}
            >
              {t("common:CONFIRM")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create role dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-[640px]">
          <DialogHeader>
            <DialogTitle>{t("team:TEAM_ROLES_ADD_ROLE_DIALOG_TITLE")}</DialogTitle>
            <DialogDescription>{t("team:TEAM_ROLES_ADD_ROLE_DIALOG_DESC")}</DialogDescription>
          </DialogHeader>

          <form
            className="flex flex-col gap-4"
            onSubmit={createForm.handleSubmit((values) => createRoleMutation.mutate(values))}
          >
            <div className="grid gap-2">
              <label className="text-sm font-medium text-foreground">
                {t("team:TEAM_ROLES_FIELD_TEMPLATE")}
              </label>
              <Controller
                name="templateRoleCode"
                control={createForm.control}
                render={({ field }) => (
                  <Select
                    value={field.value || undefined}
                    onChange={(v) => field.onChange(v)}
                    placeholder={t("team:TEAM_ROLES_FIELD_TEMPLATE_PLACEHOLDER")}
                    getPopupContainer={(node) => node.parentElement ?? document.body}
                    dropdownStyle={{ zIndex: 3000 }}
                    options={[
                      { value: "__none__", label: t("team:TEAM_ROLES_TEMPLATE_NONE") },
                      ...roles.map((r) => ({ value: r.code, label: r.name })),
                    ]}
                  />
                )}
              />
              {createErrors.templateRoleCode?.message ? (
                <p className="text-xs text-destructive">
                  {String(createErrors.templateRoleCode.message)}
                </p>
              ) : null}
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium text-foreground">
                {t("team:TEAM_ROLES_FIELD_NAME")}
              </label>
              <Controller
                name="name"
                control={createForm.control}
                render={({ field }) => (
                  <Input value={field.value} onChange={(e) => field.onChange(e.target.value)} />
                )}
              />
              {createErrors.name?.message ? (
                <p className="text-xs text-destructive">{String(createErrors.name.message)}</p>
              ) : null}
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium text-foreground">
                {t("team:TEAM_ROLES_FIELD_DESC")}
              </label>
              <Controller
                name="description"
                control={createForm.control}
                render={({ field }) => (
                  <Input.TextArea
                    autoSize={{ minRows: 3, maxRows: 6 }}
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value)}
                  />
                )}
              />
            </div>

            <DialogFooter>
              <Button onClick={() => setCreateOpen(false)} disabled={createRoleMutation.isPending}>
                {t("common:CANCEL")}
              </Button>
              <Button type="primary" htmlType="submit" loading={createRoleMutation.isPending}>
                {t("common:CONFIRM")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </DefaultPage>
  );
}
