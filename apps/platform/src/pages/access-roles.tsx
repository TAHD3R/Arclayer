import { Copy, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PlatformRoleCatalogItemOut } from "@arclayer/platform-openapi";

import {
  getCurrentPlatformTeamIdentity,
  listPlatformPermissions,
  listPlatformRoles,
} from "@/access/access-api";
import {
  localizePlatformPermission,
  localizePlatformPermissionDomain,
} from "@/access/platform-permission-copy";
import { CreateRoleDialog, EditRoleDialog, RetireRoleDialog } from "@/access/platform-role-dialogs";
import { AccessPage, AccessQueryState, useAccessQuery } from "@/access/access-ui";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type RolesTab = "roles" | "permissions";
type RoleAction =
  | Readonly<{ kind: "create" }>
  | Readonly<{ kind: "copy" | "edit" | "retire"; role: PlatformRoleCatalogItemOut }>
  | null;

export function PlatformRolesPage() {
  const { t } = useTranslation("access");
  const [tab, setTab] = useState<RolesTab>("roles");
  const [successKey, setSuccessKey] = useState<string | null>(null);
  const [action, setAction] = useState<RoleAction>(null);
  const load = useCallback(
    async () => ({
      identity: await getCurrentPlatformTeamIdentity(),
      permissions: await listPlatformPermissions(),
      roles: await listPlatformRoles(),
    }),
    [],
  );
  const { state, retry } = useAccessQuery(load, []);
  const canManage = Boolean(
    state.status === "ready" &&
    (state.data.identity.isInstanceOwner ||
      state.data.identity.effectivePermissions.includes("platform:access-roles:manage")),
  );

  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value as RolesTab)}>
      <AccessPage
        description={t("ROLES_DESCRIPTION")}
        extra={
          <TabsList>
            <TabsTrigger value="roles">{t("ROLES_TAB_ROLES")}</TabsTrigger>
            <TabsTrigger value="permissions">{t("ROLES_TAB_PERMISSIONS")}</TabsTrigger>
          </TabsList>
        }
        primaryAction={
          canManage && tab === "roles" ? (
            <Button onClick={() => setAction({ kind: "create" })}>
              <Plus aria-hidden="true" />
              {t("CREATE_ROLE")}
            </Button>
          ) : undefined
        }
        title={t("ROLES_TITLE")}
      >
        {successKey ? (
          <Alert role="status">
            <AlertDescription>{t(successKey)}</AlertDescription>
          </Alert>
        ) : null}
        <AccessQueryState isEmpty={(data) => data.roles.length === 0} retry={retry} state={state}>
          {({ roles, permissions }) => {
            const completed = (messageKey: string) => {
              setSuccessKey(messageKey);
              retry();
            };
            return (
              <>
                <TabsContent className="mt-0" value="roles">
                  <RoleDirectory canManage={canManage} onAction={setAction} roles={roles} />
                </TabsContent>
                <TabsContent className="mt-0" value="permissions">
                  <PermissionDirectory permissions={permissions} />
                </TabsContent>
                {action?.kind === "create" ? (
                  <CreateRoleDialog
                    onCompleted={completed}
                    onOpenChange={(open) => !open && setAction(null)}
                    open
                    permissions={permissions}
                  />
                ) : null}
                {action?.kind === "copy" ? (
                  <CreateRoleDialog
                    onCompleted={completed}
                    onOpenChange={(open) => !open && setAction(null)}
                    open
                    permissions={permissions}
                    sourceRole={action.role}
                  />
                ) : null}
                {action?.kind === "edit" ? (
                  <EditRoleDialog
                    onCompleted={completed}
                    onOpenChange={(open) => !open && setAction(null)}
                    open
                    permissions={permissions}
                    role={action.role}
                  />
                ) : null}
                {action?.kind === "retire" ? (
                  <RetireRoleDialog
                    onCompleted={completed}
                    onOpenChange={(open) => !open && setAction(null)}
                    open
                    permissions={permissions}
                    role={action.role}
                  />
                ) : null}
              </>
            );
          }}
        </AccessQueryState>
      </AccessPage>
    </Tabs>
  );
}

function RoleDirectory({
  canManage,
  onAction,
  roles,
}: Readonly<{
  canManage: boolean;
  onAction: (action: RoleAction) => void;
  roles: PlatformRoleCatalogItemOut[];
}>) {
  const { t } = useTranslation("access");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("ROLE_CATALOG")}</CardTitle>
        <CardDescription>{t("ROLE_CATALOG_DESCRIPTION")}</CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("ROLE_COLUMN_NAME")}</TableHead>
              <TableHead>{t("ROLE_COLUMN_TYPE")}</TableHead>
              <TableHead>{t("ROLE_COLUMN_PERMISSIONS")}</TableHead>
              <TableHead>{t("ROLE_COLUMN_REVISION")}</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">{t("ACTIONS")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {roles.map((role) => (
              <TableRow key={role.roleId}>
                <TableCell>
                  <p className="font-medium">{role.name}</p>
                  {role.description ? (
                    <p className="max-w-xl text-sm text-muted-foreground">{role.description}</p>
                  ) : null}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{t(`ROLE_KIND_${role.kind.toUpperCase()}`)}</Badge>
                </TableCell>
                <TableCell>
                  {t("ROLE_PERMISSION_COUNT", { count: role.permissionCodes.length })}
                </TableCell>
                <TableCell>v{role.revisionSequence}</TableCell>
                <TableCell>
                  {canManage ? <RoleActions onAction={onAction} role={role} /> : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function RoleActions({
  onAction,
  role,
}: Readonly<{ onAction: (action: RoleAction) => void; role: PlatformRoleCatalogItemOut }>) {
  const { t } = useTranslation("access");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-label={t("ROLE_ACTIONS", { name: role.name })} size="icon" variant="ghost">
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onAction({ kind: "copy", role })}>
          <Copy aria-hidden="true" />
          {t("COPY_ROLE")}
        </DropdownMenuItem>
        {role.kind === "custom" ? (
          <>
            <DropdownMenuItem onSelect={() => onAction({ kind: "edit", role })}>
              <Pencil aria-hidden="true" />
              {t("EDIT_ROLE")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => onAction({ kind: "retire", role })}
            >
              <Trash2 aria-hidden="true" />
              {t("RETIRE_ROLE")}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PermissionDirectory({
  permissions,
}: Readonly<{ permissions: Awaited<ReturnType<typeof listPlatformPermissions>> }>) {
  const { t } = useTranslation("access");
  const groups = useMemo(() => {
    const grouped = new Map<string, typeof permissions>();
    for (const permission of permissions)
      grouped.set(permission.ownerDomain, [
        ...(grouped.get(permission.ownerDomain) ?? []),
        permission,
      ]);
    return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [permissions]);
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {groups.map(([domain, items]) => (
        <Card key={domain}>
          <CardHeader>
            <CardTitle>
              {t("PERMISSION_DOMAIN_TITLE", {
                domain: localizePlatformPermissionDomain(domain, t),
              })}
            </CardTitle>
            <CardDescription>{t("PERMISSION_DOMAIN_DESCRIPTION")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {items.map((permission) => {
              const copy = localizePlatformPermission(permission.code, t);
              return (
                <article className="border-t pt-3" key={permission.code}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium">{copy.name}</p>
                    <Badge variant={permission.isDelegable ? "secondary" : "outline"}>
                      {t(permission.isDelegable ? "PERMISSION_DELEGABLE" : "PERMISSION_OWNER_ONLY")}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{copy.description}</p>
                  <code className="mt-2 block text-xs text-muted-foreground">
                    {permission.code}
                  </code>
                </article>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
