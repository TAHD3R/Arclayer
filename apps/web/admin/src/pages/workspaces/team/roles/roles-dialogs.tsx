import * as React from "react";
import { Button, Input, Select } from "antd";
import { Controller, type FieldErrors, type UseFormReturn } from "react-hook-form";
import { getPopupContainerWithinOverlay } from "@/lib/antd/popup-container";
import { cn } from "@/lib/utils";

import type { AdminMenuNode } from "@/api/admin-menus";
import type { RbacMatrixPermissionRow, Role } from "@/api/rbac";
import { PageState } from "@/components/common/page-state";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { collectDescendantPermissionCodes, normalizePermissionCode } from "./roles-utils";
import type { CreateRoleFormValues, MenuScopeCheckedState } from "./roles-utils";

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

const MENU_NODE_DEPTH_PADDING_CLASSES = [
  "pl-2",
  "pl-6",
  "pl-10",
  "pl-14",
  "pl-[4.5rem]",
  "pl-[5.5rem]",
  "pl-[6.5rem]",
  "pl-[7.5rem]",
] as const;

interface TeamRolesDialogsProps {
  t: TranslateFn;
  deleteOpen: boolean;
  setDeleteOpen: React.Dispatch<React.SetStateAction<boolean>>;
  deleteTarget: { code: string; name: string } | null;
  setDeleteTarget: React.Dispatch<React.SetStateAction<{ code: string; name: string } | null>>;
  deleteRolePending: boolean;
  onDeleteRoleConfirm: (roleCode: string) => Promise<void>;
  menuScopeOpen: boolean;
  setMenuScopeOpen: React.Dispatch<React.SetStateAction<boolean>>;
  customRoles: Role[];
  menuScopeRoleCode: string | null;
  setMenuScopeRoleCode: React.Dispatch<React.SetStateAction<string | null>>;
  menuCatalogItems: AdminMenuNode[];
  menuCatalogLoading: boolean;
  menuCatalogError: unknown;
  menuCatalogIsError: boolean;
  onMenuCatalogRetry: () => void;
  menuScopeDraft: Record<string, boolean>;
  setMenuScopeDraft: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  saveMenuScopePending: boolean;
  onSaveMenuScope: () => void;
  permissionDialogOpen: boolean;
  setPermissionDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;
  activePermission: RbacMatrixPermissionRow | null;
  roles: Role[];
  permissionDraft: Record<string, boolean>;
  setPermissionDraft: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  savePermissionPending: boolean;
  onSavePermission: () => void;
  createOpen: boolean;
  setCreateOpen: React.Dispatch<React.SetStateAction<boolean>>;
  createForm: UseFormReturn<CreateRoleFormValues>;
  createErrors: FieldErrors<CreateRoleFormValues>;
  createRolePending: boolean;
  onCreateRoleSubmit: (values: CreateRoleFormValues) => void;
}

export function TeamRolesDialogs(props: TeamRolesDialogsProps) {
  const {
    t,
    deleteOpen,
    setDeleteOpen,
    deleteTarget,
    setDeleteTarget,
    deleteRolePending,
    onDeleteRoleConfirm,
    menuScopeOpen,
    setMenuScopeOpen,
    customRoles,
    menuScopeRoleCode,
    setMenuScopeRoleCode,
    menuCatalogItems,
    menuCatalogLoading,
    menuCatalogError,
    menuCatalogIsError,
    onMenuCatalogRetry,
    menuScopeDraft,
    setMenuScopeDraft,
    saveMenuScopePending,
    onSaveMenuScope,
    permissionDialogOpen,
    setPermissionDialogOpen,
    activePermission,
    roles,
    permissionDraft,
    setPermissionDraft,
    savePermissionPending,
    onSavePermission,
    createOpen,
    setCreateOpen,
    createForm,
    createErrors,
    createRolePending,
    onCreateRoleSubmit,
  } = props;

  const renderMenuNode = React.useCallback(
    (node: AdminMenuNode, depth: number): React.ReactNode => {
      const permissionSet = collectDescendantPermissionCodes(node);
      const permissionCodes = Array.from(permissionSet);
      const selectedCount = permissionCodes.filter((code) => Boolean(menuScopeDraft[code])).length;
      const checkedState: MenuScopeCheckedState =
        permissionCodes.length === 0
          ? false
          : selectedCount === 0
            ? false
            : selectedCount === permissionCodes.length
              ? true
              : "indeterminate";

      const label = node.titleI18n ? t(node.titleI18n) : node.title;
      const directPermission = normalizePermissionCode(node.permissionCode);

      return (
        <div key={node.code}>
          <div
            className={cn(
              "flex items-start gap-3 rounded-md px-2 py-2 hover:bg-muted/30",
              MENU_NODE_DEPTH_PADDING_CLASSES[
                Math.min(depth, MENU_NODE_DEPTH_PADDING_CLASSES.length - 1)
              ],
            )}
          >
            <Checkbox
              checked={checkedState}
              disabled={!menuScopeRoleCode || permissionCodes.length === 0}
              onCheckedChange={(value) => {
                const nextChecked = Boolean(value);
                const targetCodes = collectDescendantPermissionCodes(node);
                setMenuScopeDraft((prev) => {
                  const next = { ...prev };
                  for (const code of targetCodes) next[code] = nextChecked;
                  return next;
                });
              }}
            />
            <div className="min-w-0">
              <div className="font-medium text-foreground">{label}</div>
              {directPermission ? (
                <div className="text-xs text-muted-foreground">
                  {t("team:TEAM_ROLES_MENU_SCOPE_PERMISSION_CODE", { code: directPermission })}
                </div>
              ) : null}
              {node.path ? <div className="text-xs text-muted-foreground">{node.path}</div> : null}
            </div>
          </div>
          {node.children?.length
            ? node.children.map((child) => renderMenuNode(child, depth + 1))
            : null}
        </div>
      );
    },
    [menuScopeDraft, menuScopeRoleCode, setMenuScopeDraft, t],
  );

  return (
    <>
      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent className="max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{t("team:TEAM_ROLES_DELETE_TITLE")}</DialogTitle>
            <DialogDescription>
              {t("team:TEAM_ROLES_DELETE_DESC", { roleName: deleteTarget?.name ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setDeleteOpen(false)} disabled={deleteRolePending}>
              {t("common:CANCEL")}
            </Button>
            <Button
              danger
              type="primary"
              loading={deleteRolePending}
              onClick={async () => {
                if (!deleteTarget?.code) return;
                await onDeleteRoleConfirm(deleteTarget.code);
                setDeleteOpen(false);
                setDeleteTarget(null);
              }}
            >
              {t("team:TEAM_ACTION_DELETE")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={menuScopeOpen} onOpenChange={setMenuScopeOpen}>
        <DialogContent className="max-w-[860px]">
          <DialogHeader>
            <DialogTitle>{t("team:TEAM_ROLES_MENU_SCOPE_TITLE")}</DialogTitle>
            <DialogDescription>{t("team:TEAM_ROLES_MENU_SCOPE_DESC")}</DialogDescription>
          </DialogHeader>

          {customRoles.length ? (
            <div className="grid gap-1.5">
              <label className="font-semibold text-foreground">
                {t("team:TEAM_ROLES_MENU_SCOPE_ROLE_LABEL")}
              </label>
              <div className="text-muted-foreground">
                {t("team:TEAM_ROLES_MENU_SCOPE_ROLE_HELP")}
              </div>
              <Select
                value={menuScopeRoleCode || undefined}
                onChange={(value) => setMenuScopeRoleCode(String(value))}
                placeholder={t("team:TEAM_ROLES_MENU_SCOPE_ROLE_PLACEHOLDER")}
                getPopupContainer={(node) => getPopupContainerWithinOverlay(node)}
                dropdownStyle={{ zIndex: 3000 }}
                options={customRoles.map((role) => ({ value: role.code, label: role.name }))}
              />
              <p className="text-xs text-muted-foreground">
                {t("team:TEAM_ROLES_MENU_SCOPE_NOTE")}
              </p>
            </div>
          ) : (
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              {t("team:TEAM_ROLES_MENU_SCOPE_NO_CUSTOM_ROLE")}
            </div>
          )}

          <div className="max-h-[420px] overflow-auto rounded-md border bg-card">
            {menuCatalogLoading && menuCatalogItems.length === 0 ? (
              <div className="p-4">
                <PageState loading loadingVariant="form" />
              </div>
            ) : menuCatalogIsError ? (
              <div className="p-4">
                <PageState loading={false} error={menuCatalogError} onRetry={onMenuCatalogRetry} />
              </div>
            ) : (
              <div className="flex flex-col gap-1 p-2">
                {menuCatalogItems.map((root) => renderMenuNode(root, 0))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button onClick={() => setMenuScopeOpen(false)} disabled={saveMenuScopePending}>
              {t("common:CANCEL")}
            </Button>
            <Button
              type="primary"
              loading={saveMenuScopePending}
              onClick={() => onSaveMenuScope()}
              disabled={!menuScopeRoleCode || customRoles.length === 0}
            >
              {t("common:CONFIRM")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={permissionDialogOpen} onOpenChange={setPermissionDialogOpen}>
        <DialogContent className="max-w-[680px]">
          <DialogHeader>
            <DialogTitle>
              {activePermission?.name || t("team:TEAM_ROLES_PERMISSION_ACTION")}
            </DialogTitle>
            <DialogDescription>
              {activePermission?.description || t("team:TEAM_ROLES_PERMISSION_DIALOG_DESC")}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[420px] overflow-auto rounded-md border bg-card p-2">
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
                    onCheckedChange={(value) => {
                      setPermissionDraft((prev) => ({ ...prev, [role.code]: Boolean(value) }));
                    }}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold text-foreground">{role.name}</span>
                    </div>
                    {role.description ? (
                      <div className="mt-0.5 line-clamp-2  text-muted-foreground">
                        {role.description}
                      </div>
                    ) : null}
                  </div>
                </label>
              );
            })}
          </div>

          <DialogFooter>
            <Button onClick={() => setPermissionDialogOpen(false)} disabled={savePermissionPending}>
              {t("common:CANCEL")}
            </Button>
            <Button
              type="primary"
              onClick={() => onSavePermission()}
              loading={savePermissionPending}
            >
              {t("common:CONFIRM")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-[640px]">
          <DialogHeader>
            <DialogTitle>{t("team:TEAM_ROLES_ADD_ROLE_DIALOG_TITLE")}</DialogTitle>
            <DialogDescription>{t("team:TEAM_ROLES_ADD_ROLE_DIALOG_DESC")}</DialogDescription>
          </DialogHeader>

          <form
            className="flex flex-col gap-4"
            onSubmit={createForm.handleSubmit(onCreateRoleSubmit)}
          >
            <div className="grid gap-2">
              <div className="grid gap-1.5">
                <label className="font-semibold text-foreground">
                  {t("team:TEAM_ROLES_FIELD_TEMPLATE")}
                </label>
                <div className="text-muted-foreground">{t("team:TEAM_ROLES_FIELD_TEMPLATE_HELP")}</div>
              </div>
              <Controller
                name="templateRoleCode"
                control={createForm.control}
                render={({ field }) => (
                  <Select
                    value={field.value || undefined}
                    onChange={(value) => field.onChange(value)}
                    placeholder={t("team:TEAM_ROLES_FIELD_TEMPLATE_PLACEHOLDER")}
                    getPopupContainer={(node) => getPopupContainerWithinOverlay(node)}
                    dropdownStyle={{ zIndex: 3000 }}
                    options={[
                      { value: "__none__", label: t("team:TEAM_ROLES_TEMPLATE_NONE") },
                      ...roles.map((role) => ({ value: role.code, label: role.name })),
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
              <div className="grid gap-1.5">
                <label className="font-semibold text-foreground">
                  {t("team:TEAM_ROLES_FIELD_NAME")}
                </label>
                <div className="text-muted-foreground">{t("team:TEAM_ROLES_FIELD_NAME_HELP")}</div>
              </div>
              <Controller
                name="name"
                control={createForm.control}
                render={({ field }) => (
                  <Input
                    value={field.value}
                    onChange={(event) => field.onChange(event.target.value)}
                  />
                )}
              />
              {createErrors.name?.message ? (
                <p className="text-xs text-destructive">{String(createErrors.name.message)}</p>
              ) : null}
            </div>

            <div className="grid gap-2">
              <div className="grid gap-1.5">
                <label className="font-semibold text-foreground">
                  {t("team:TEAM_ROLES_FIELD_DESC")}
                </label>
                <div className="text-muted-foreground">{t("team:TEAM_ROLES_FIELD_DESC_HELP")}</div>
              </div>
              <Controller
                name="description"
                control={createForm.control}
                render={({ field }) => (
                  <Input.TextArea
                    autoSize={{ minRows: 3, maxRows: 6 }}
                    value={field.value}
                    onChange={(event) => field.onChange(event.target.value)}
                  />
                )}
              />
            </div>

            <DialogFooter>
              <Button onClick={() => setCreateOpen(false)} disabled={createRolePending}>
                {t("common:CANCEL")}
              </Button>
              <Button type="primary" htmlType="submit" loading={createRolePending}>
                {t("common:CONFIRM")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
