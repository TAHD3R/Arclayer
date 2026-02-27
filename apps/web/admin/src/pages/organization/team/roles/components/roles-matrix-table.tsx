import { Button as AntButton, Checkbox, Dropdown, Spin } from "antd";
import type { MenuProps } from "antd";
import { MoreVertical, Trash2 } from "lucide-react";

import { getPopupContainerWithinOverlay } from "@/lib/antd/popup-container";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import type {
  DisplayOrganizationPermission,
  DisplayOrganizationRole,
} from "../hooks/use-organization-roles-display";

type Translate = (key: string, opts?: Record<string, unknown>) => string;

type RolesMatrixTableProps = {
  filteredRoles: DisplayOrganizationRole[];
  filteredPermissions: DisplayOrganizationPermission[];
  onDeleteRole: (roleCode: string) => void;
  onTogglePermission: (permissionCode: string, roleCode: string, granted: boolean) => void;
  togglingKey: string | null;
  t: Translate;
};

export function RolesMatrixTable(props: RolesMatrixTableProps) {
  const { filteredRoles, filteredPermissions, onDeleteRole, onTogglePermission, togglingKey, t } =
    props;

  return (
    <div className="relative isolate overflow-auto">
      <table className="w-full min-w-max text-callout [&_th]:whitespace-nowrap">
        <TableHeader className="sticky top-0 z-[2] bg-background">
          <TableRow className="border-border/40 hover:bg-transparent">
            <TableHead className="sticky left-0 z-[3] w-[360px] bg-background text-center uppercase tracking-wider">
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
                <TableHead
                  key={role.code}
                  className="min-w-[160px] text-center uppercase tracking-wider"
                >
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
            <TableRow
              key={permission.code}
              className="group/row border-border/40 hover:bg-muted/40"
            >
              <TableCell className="sticky left-0 z-[1] w-90 bg-background group-hover/row:bg-muted/40 transition-colors">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-foreground">
                    {permission.displayName}
                  </div>
                  {permission.displayDescription ? (
                    <div className="mt-0.5 line-clamp-2 text-label-secondary">
                      {permission.displayDescription}
                    </div>
                  ) : null}
                </div>
              </TableCell>

              {filteredRoles.map((role) => {
                const granted = permission.grantedRoleCodes.includes(role.code);
                const key = `${permission.code}:${role.code}`;
                return (
                  <TableCell key={key} className="text-center">
                    <div className="flex justify-center">
                      {togglingKey === key ? (
                        <Spin size="small" />
                      ) : (
                        <Checkbox
                          checked={granted}
                          disabled={role.isSystem}
                          onChange={(e) => {
                            onTogglePermission(permission.code, role.code, e.target.checked);
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
  );
}
