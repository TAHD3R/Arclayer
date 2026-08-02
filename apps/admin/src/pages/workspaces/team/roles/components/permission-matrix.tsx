import * as React from "react";
import { LockKeyhole, MoreHorizontal, Pencil, SlidersHorizontal, Trash2 } from "lucide-react";

import type {
  WorkspacePermissionOut as Permission,
  WorkspaceRoleOut as Role,
  RolePermissionGrantOut as RolePermissionGrant,
} from "@arclayer/openapi";
import { Button } from "@arclayer/ui/button";
import { Checkbox } from "@arclayer/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuIconItem,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@arclayer/ui/table";

import { BaseTag } from "@/components/ui/tags";
import { SettingsSectionAnchor } from "@/components/layout/settings-screen-provider";

import { conditionSetCount, type PermissionGrantsByRole } from "./permission-catalog-state";

type Translate = (key: string, options?: Record<string, unknown>) => string;

export type PermissionGroupSection = {
  code: string;
  name: string;
  permissions: Permission[];
};

export function PermissionMatrix(props: {
  t: Translate;
  groups: PermissionGroupSection[];
  roles: Role[];
  draftGrantsByRole: PermissionGrantsByRole;
  canManageRoles: boolean;
  pending: boolean;
  validationTarget?: { roleCode?: string; permissionCode?: string } | null;
  onToggle: (roleCode: string, permissionCode: string, checked: boolean) => void;
  onEditConditions: (role: Role, permission: Permission) => void;
  onEditRole: (role: Role) => void;
  onDeleteRole: (role: Role) => void;
}) {
  const [selectedRoleCode, setSelectedRoleCode] = React.useState(props.roles[0]?.code ?? "");
  React.useEffect(() => {
    if (props.roles.some((role) => role.code === selectedRoleCode)) return;
    setSelectedRoleCode(props.roles[0]?.code ?? "");
  }, [props.roles, selectedRoleCode]);
  const selectedRole = props.roles.find((role) => role.code === selectedRoleCode) ?? props.roles[0];

  return (
    <SettingsSectionAnchor section="roles-table">
      <div className="hidden max-h-[min(62vh,48rem)] overflow-auto rounded-xl border border-border/70 bg-background md:block">
        <table className="w-max min-w-full border-collapse text-callout">
          <TableHeader>
            <TableRow className="border-border/60 bg-background hover:bg-background">
              <TableHead className="sticky top-0 left-0 z-[4] w-88 min-w-88 bg-background px-4">
                {props.t("team:TEAM_ROLES_COL_PERMISSION")}
              </TableHead>
              {props.roles.map((role) => (
                <TableHead
                  key={role.code}
                  className="sticky top-0 z-[3] w-36 min-w-36 bg-background px-2 text-center"
                >
                  <RoleHeader
                    t={props.t}
                    role={role}
                    canManageRoles={props.canManageRoles}
                    pending={props.pending}
                    onEditRole={props.onEditRole}
                    onDeleteRole={props.onDeleteRole}
                  />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.groups.map((group) => (
              <React.Fragment key={group.code}>
                <TableRow className="border-border/60 bg-muted/45 hover:bg-muted/45">
                  <TableCell
                    colSpan={props.roles.length + 1}
                    className="sticky left-0 z-[2] px-4 py-2 text-footnote font-semibold text-label-secondary"
                  >
                    {group.name}
                  </TableCell>
                </TableRow>
                {group.permissions.map((permission) => (
                  <PermissionRow key={permission.code} {...props} permission={permission} />
                ))}
              </React.Fragment>
            ))}
          </TableBody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">
        <Select value={selectedRole?.code ?? ""} onValueChange={setSelectedRoleCode}>
          <SelectTrigger className="w-full" aria-label={props.t("team:TEAM_ROLES_MOBILE_ROLE")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="start">
            {props.roles.map((role) => (
              <SelectItem key={role.code} value={role.code}>
                {role.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedRole ? (
          <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-background">
            {props.groups.map((group) => (
              <React.Fragment key={group.code}>
                <div className="bg-muted/45 px-4 py-2 text-footnote font-semibold text-label-secondary">
                  {group.name}
                </div>
                {group.permissions.map((permission) => (
                  <MobilePermissionRow
                    key={permission.code}
                    {...props}
                    role={selectedRole}
                    permission={permission}
                  />
                ))}
              </React.Fragment>
            ))}
          </div>
        ) : null}
      </div>
    </SettingsSectionAnchor>
  );
}

function RoleHeader(props: {
  t: Translate;
  role: Role;
  canManageRoles: boolean;
  pending: boolean;
  onEditRole: (role: Role) => void;
  onDeleteRole: (role: Role) => void;
}) {
  return (
    <SettingsSectionAnchor
      section="role-row"
      payloadMatches={(payload) => payload?.roleId === props.role.code}
      className="flex min-h-20 items-center justify-center gap-1.5"
    >
      <div className="min-w-0">
        <div className="truncate font-semibold text-label-primary" title={props.role.name}>
          {props.role.name}
        </div>
        <div className="mt-1 flex justify-center">
          <BaseTag color={props.role.isSystem ? "default" : "blue"} textStyle="caption">
            {props.role.isSystem
              ? props.t("team:TEAM_ROLES_SOURCE_SYSTEM")
              : props.t("team:TEAM_ROLES_SOURCE_CUSTOM")}
          </BaseTag>
        </div>
      </div>
      {props.role.isSystem ? (
        <LockKeyhole className="size-3.5 shrink-0 text-label-secondary" aria-hidden="true" />
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-xs" aria-label={props.t("team:TEAM_USER_ACTIONS")}>
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuIconItem
              icon={<Pencil className="size-4" />}
              disabled={!props.canManageRoles || props.pending}
              onSelect={() => props.onEditRole(props.role)}
            >
              {props.t("team:TEAM_ACTION_EDIT")}
            </DropdownMenuIconItem>
            <DropdownMenuIconItem
              icon={<Trash2 className="size-4" />}
              variant="destructive"
              disabled={!props.canManageRoles || props.pending}
              onSelect={() => props.onDeleteRole(props.role)}
            >
              {props.t("team:TEAM_ACTION_DELETE")}
            </DropdownMenuIconItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </SettingsSectionAnchor>
  );
}

function PermissionRow(props: Parameters<typeof PermissionMatrix>[0] & { permission: Permission }) {
  return (
    <TableRow className="border-border/45 bg-background hover:bg-muted/20">
      <TableCell className="sticky left-0 z-[1] w-88 min-w-88 bg-inherit px-4 py-3">
        <PermissionIdentity t={props.t} permission={props.permission} />
      </TableCell>
      {props.roles.map((role) => (
        <TableCell key={role.code} className="w-36 min-w-36 px-2 py-3 text-center">
          <GrantControl {...props} role={role} permission={props.permission} />
        </TableCell>
      ))}
    </TableRow>
  );
}

function MobilePermissionRow(
  props: Parameters<typeof PermissionMatrix>[0] & { role: Role; permission: Permission },
) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-3">
      <PermissionIdentity t={props.t} permission={props.permission} />
      <GrantControl {...props} role={props.role} permission={props.permission} />
    </div>
  );
}

function PermissionIdentity(props: { t: Translate; permission: Permission }) {
  const lifecycleColor = props.permission.lifecycle === "deprecated" ? "gold" : "red";
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-label-primary">{props.permission.name}</span>
        {props.permission.lifecycle !== "active" ? (
          <BaseTag color={lifecycleColor} textStyle="caption">
            {props.permission.lifecycle === "deprecated"
              ? props.t("team:TEAM_ROLES_LIFECYCLE_DEPRECATED")
              : props.t("team:TEAM_ROLES_LIFECYCLE_UNAVAILABLE")}
          </BaseTag>
        ) : null}
      </div>
      {props.permission.description ? (
        <div className="mt-0.5 line-clamp-2 text-footnote text-label-secondary">
          {props.permission.description}
        </div>
      ) : null}
      <div className="mt-1 flex flex-wrap items-center gap-2 text-caption text-label-tertiary">
        <span>{props.permission.ownerName || props.permission.ownerKey}</span>
        <span aria-hidden="true">·</span>
        <code>{props.permission.code}</code>
      </div>
    </div>
  );
}

function GrantControl(
  props: Parameters<typeof PermissionMatrix>[0] & { role: Role; permission: Permission },
) {
  const grants = props.draftGrantsByRole[props.role.code] ?? [];
  const granted = grants.some(
    (grant: RolePermissionGrant) => grant.permissionCode === props.permission.code,
  );
  const conditions = conditionSetCount(grants, props.permission.code);
  const invalid =
    props.validationTarget?.roleCode === props.role.code &&
    props.validationTarget?.permissionCode === props.permission.code;
  const unavailable = props.permission.lifecycle !== "active";
  return (
    <div className="flex min-w-18 flex-col items-center gap-1.5">
      <Checkbox
        checked={granted}
        aria-invalid={invalid || undefined}
        disabled={props.role.isSystem || !props.canManageRoles || props.pending || unavailable}
        onCheckedChange={(checked) =>
          props.onToggle(props.role.code, props.permission.code, checked === true)
        }
      />
      {granted && (conditions > 0 || (props.permission.conditionTemplates?.length ?? 0) > 0) ? (
        <Button
          variant="ghost"
          size="xs"
          className="h-6 px-1.5 text-caption"
          disabled={props.role.isSystem || !props.canManageRoles || props.pending}
          onClick={() => props.onEditConditions(props.role, props.permission)}
        >
          <SlidersHorizontal className="size-3" />
          {conditions > 0
            ? props.t("team:TEAM_ROLES_CONDITION_SET_COUNT", { count: conditions })
            : props.t("team:TEAM_ROLES_CONDITION_CONFIGURE")}
        </Button>
      ) : null}
    </div>
  );
}
