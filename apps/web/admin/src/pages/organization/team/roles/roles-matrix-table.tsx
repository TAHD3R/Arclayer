import { Button as AntButton, Dropdown } from "antd";
import type { MenuProps } from "antd";
import { Check, MoreVertical, Trash2 } from "lucide-react";

import { getPopupContainerWithinOverlay } from "@/lib/antd/popup-container";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import type { DisplayOrganizationPermission, DisplayOrganizationRole } from "./roles-display";

type Translate = (key: string, opts?: Record<string, unknown>) => string;

type RolesMatrixTableProps = {
  filteredRoles: DisplayOrganizationRole[];
  filteredPermissions: DisplayOrganizationPermission[];
  onDeleteRole: (roleCode: string) => void;
  onPermissionEdit: (permission: DisplayOrganizationPermission) => void;
  t: Translate;
};

export function RolesMatrixTable(props: RolesMatrixTableProps) {
  const { filteredRoles, filteredPermissions, onDeleteRole, onPermissionEdit, t } = props;

  return (
    <div className="overflow-auto rounded-lg border bg-card">
      <table className="w-full min-w-max text-sm [&_th]:whitespace-nowrap">
        <TableHeader className="sticky top-0 z-20 bg-card">
          <TableRow>
            <TableHead className="sticky left-0 z-30 w-[360px] bg-card text-center">
              {t("team:TEAM_ROLES_COL_PERMISSION")}
            </TableHead>
            {filteredRoles.map((role) => {
              const menuItems: NonNullable<MenuProps["items"]> = [
                {
                  key: "delete",
                  label: t("team:TEAM_ACTION_DELETE"),
                  danger: true,
                  icon: <Trash2 className="h-4 w-4" />,
                  onClick: () => onDeleteRole(role.code),
                },
              ];

              return (
                <TableHead key={role.code} className="min-w-[160px] text-center">
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                    <div />
                    <div className="truncate font-medium text-foreground">{role.name}</div>
                    <div className="flex justify-end">
                      {role.isSystem ? null : (
                        <Dropdown
                          trigger={["click"]}
                          menu={{ items: menuItems }}
                          getPopupContainer={(node) => getPopupContainerWithinOverlay(node)}
                          overlayStyle={{ zIndex: 1400 }}
                        >
                          <AntButton
                            type="text"
                            className="!h-8 !w-8 !p-0"
                            icon={<MoreVertical className="h-4 w-4" />}
                            aria-label={t("team:TEAM_USER_ACTIONS")}
                          />
                        </Dropdown>
                      )}
                    </div>
                  </div>
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>

        <TableBody>
          {filteredPermissions.map((permission) => (
            <TableRow key={permission.code}>
              <TableCell className="sticky left-0 z-10 w-90 bg-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-foreground">
                      {permission.displayName}
                    </div>
                    {permission.displayDescription ? (
                      <div className="mt-0.5 line-clamp-2 text-muted-foreground">
                        {permission.displayDescription}
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() => onPermissionEdit(permission)}
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
  );
}
