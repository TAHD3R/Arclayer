"use client";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuIconItem,
} from "@celestial/ui/dropdown-menu";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { MoreVertical, Plus, Search, Trash2, X } from "lucide-react";
import {
  createWorkspaceRoleFromTemplate,
  deleteWorkspaceRole,
  getWorkspaceRbacMatrix,
  setWorkspacePermissionRoles,
} from "@/api/rbac";
import { DefaultPage } from "@/components/common/default-page";
import { ContentGuard } from "@/components/common/content-guard";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@celestial/ui/table";
import { Button } from "@celestial/ui/button";
import { Checkbox } from "@celestial/ui/checkbox";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@celestial/ui/input-group";
import { Spinner } from "@celestial/ui/spinner";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { useAuthStore } from "@/stores/use-auth-store";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { TeamRolesDialogs } from "./roles-dialogs";
import { includesText, normalizeNeedle, sortByName } from "../utils";
import type { CreateRoleFormValues } from "../utils";

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

  React.useEffect(() => {
    if (!createOpen) {
      createForm.reset({ templateRoleCode: "__none__", name: "", description: "" });
      return;
    }
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
      <DefaultPage title={t("team:TEAM_ROLES_TITLE")} description={t("team:TEAM_ROLES_DESC")}>
        <ContentGuard
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
      <DefaultPage title={t("team:TEAM_ROLES_TITLE")} description={t("team:TEAM_ROLES_DESC")}>
        <ContentGuard loading loadingVariant="table" />
      </DefaultPage>
    );
  }

  if (matrixQuery.isError) {
    return (
      <DefaultPage title={t("team:TEAM_ROLES_TITLE")} description={t("team:TEAM_ROLES_DESC")}>
        <ContentGuard
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
      action={
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          {t("team:TEAM_ROLES_ADD_ROLE")}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <InputGroup className="max-w-[360px]">
          <InputGroupAddon>
            <Search className="h-4 w-4 text-label-secondary" />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("team:TEAM_ROLES_SEARCH_PLACEHOLDER")}
          />
          {search ? (
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                aria-label={t("common:CLEAR")}
                size="icon-xs"
                onClick={() => setSearch("")}
              >
                <X className="size-3.5" />
              </InputGroupButton>
            </InputGroupAddon>
          ) : null}
        </InputGroup>

        {hasEmptySearch ? (
          <ContentGuard loading={false} empty emptyTitle={t("team:TEAM_ROLES_EMPTY_SEARCH")} />
        ) : (
          <div className="relative isolate">
            {showTopScrollbar ? (
              <div
                ref={topScrollRef}
                onScroll={onTopScroll}
                className="h-4 overflow-x-auto overflow-y-hidden border-b"
              >
                <div ref={scrollSpacerRef} className="h-1" />
              </div>
            ) : null}
            <div ref={mainScrollRef} onScroll={onMainScroll} className="overflow-auto">
              <table
                ref={tableRef}
                className="w-full min-w-max caption-bottom text-callout [&_th]:whitespace-nowrap"
              >
                <TableHeader className="sticky top-0 z-[2] bg-background">
                  <TableRow className="border-border/40 hover:bg-transparent">
                    <TableHead className="sticky left-0 z-[3] w-[360px] bg-background text-center uppercase tracking-wider">
                      {t("team:TEAM_ROLES_COL_PERMISSION")}
                    </TableHead>
                    {filteredRoles.map((role) => {
                      return (
                        <TableHead
                          key={role.code}
                          className="min-w-[160px] text-center uppercase tracking-wider"
                        >
                          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                            <div />
                            <div className="min-w-0">
                              <div className="truncate font-medium text-foreground">
                                {role.name}
                              </div>
                            </div>
                            <div className="flex justify-end">
                              {!role.isSystem ? (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon-sm"
                                      aria-label={t("team:TEAM_ACTION_DELETE")}
                                    >
                                      <MoreVertical className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuIconItem
                                      icon={<Trash2 className="h-4 w-4" />}
                                      variant="destructive"
                                      disabled={deleteRoleMutation.isPending}
                                      onSelect={() => {
                                        setDeleteTarget({ code: role.code, name: role.name });
                                        setDeleteOpen(true);
                                      }}
                                    >
                                      {t("team:TEAM_ACTION_DELETE")}
                                    </DropdownMenuIconItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              ) : null}
                            </div>
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
                      className="group/row border-border/40 hover:bg-muted/40"
                    >
                      <TableCell className="sticky left-0 z-[1] w-90 bg-background group-hover/row:bg-muted/40 transition-colors">
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-foreground">{perm.name}</div>
                          {perm.description ? (
                            <div className="mt-0.5 line-clamp-2 text-label-secondary">
                              {perm.description}
                            </div>
                          ) : null}
                          {perm.pluginId && perm.pluginId !== "core" ? (
                            <div className="mt-1 text-caption text-label-secondary bg-background border border-border p-1 rounded-md select-none">
                              {t("team:TEAM_ROLES_PERMISSION_PROVIDED_BY", {
                                pluginName: perm.pluginName || perm.pluginId,
                              })}
                            </div>
                          ) : null}
                        </div>
                      </TableCell>
                      {filteredRoles.map((role) => {
                        const granted = perm.grantedRoleCodes?.includes(role.code) ?? false;
                        const key = `${perm.code}:${role.code}`;
                        return (
                          <TableCell key={key} className="text-center">
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
        roles={roles}
      />
    </DefaultPage>
  );
}
