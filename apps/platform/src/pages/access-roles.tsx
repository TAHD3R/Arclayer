import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PlatformRoleCatalogItemOut } from "@arclayer/platform-openapi";

import {
  getCurrentPlatformTeamIdentity,
  listPlatformPermissions,
  listPlatformRoles,
} from "@/access/access-api";
import { CreateRoleDialog, EditRoleDialog, RetireRoleDialog } from "@/access/platform-role-dialogs";
import { AccessPage, AccessQueryState, useAccessQuery } from "@/access/access-ui";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function PlatformRolesPage() {
  const { t } = useTranslation("access");
  const [successKey, setSuccessKey] = useState<string | null>(null);
  const [action, setAction] = useState<
    | Readonly<{ kind: "create" }>
    | Readonly<{ kind: "copy" | "edit" | "retire"; role: PlatformRoleCatalogItemOut }>
    | null
  >(null);
  const load = useCallback(
    async () => ({
      identity: await getCurrentPlatformTeamIdentity(),
      roles: await listPlatformRoles(),
      permissions: await listPlatformPermissions(),
    }),
    [],
  );
  const { state, retry } = useAccessQuery(load, []);
  return (
    <AccessPage description={t("ROLES_DESCRIPTION")} title={t("ROLES_TITLE")}>
      <AccessQueryState isEmpty={(data) => data.roles.length === 0} retry={retry} state={state}>
        {({ identity, roles, permissions }) => {
          const canManage = identity.effectivePermissions.includes("platform:access-roles:manage");
          const completed = (messageKey: string) => {
            setSuccessKey(messageKey);
            retry();
          };
          return (
            <>
              <div className="flex justify-end">
                {canManage ? (
                  <Button onClick={() => setAction({ kind: "create" })}>
                    <Plus aria-hidden="true" />
                    {t("CREATE_ROLE")}
                  </Button>
                ) : null}
              </div>
              {successKey ? (
                <Alert>
                  <AlertDescription>{t(successKey)}</AlertDescription>
                </Alert>
              ) : null}
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
                <Card>
                  <CardHeader>
                    <CardTitle>{t("ROLE_CATALOG")}</CardTitle>
                    <CardDescription>{t("ROLE_CATALOG_DESCRIPTION")}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {roles.map((role) => (
                      <article className="rounded-lg border p-4" key={role.roleId}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h2 className="font-semibold">{role.name}</h2>
                          <Badge variant="outline">
                            {t(`ROLE_KIND_${role.kind.toUpperCase()}`)}
                          </Badge>
                        </div>
                        {role.description && (
                          <p className="mt-2 text-sm text-muted-foreground">{role.description}</p>
                        )}
                        <p className="mt-3 text-sm text-muted-foreground">
                          {t("ROLE_PERMISSION_COUNT", { count: role.permissionCodes.length })}
                        </p>
                        {canManage ? (
                          <div className="mt-4 flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setAction({ kind: "copy", role })}
                            >
                              <Copy aria-hidden="true" />
                              {t("COPY_ROLE")}
                            </Button>
                            {role.kind === "custom" ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setAction({ kind: "edit", role })}
                                >
                                  <Pencil aria-hidden="true" />
                                  {t("EDIT_ROLE")}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setAction({ kind: "retire", role })}
                                >
                                  <Trash2 aria-hidden="true" />
                                  {t("RETIRE_ROLE")}
                                </Button>
                              </>
                            ) : null}
                          </div>
                        ) : null}
                      </article>
                    ))}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>{t("PERMISSION_CATALOG")}</CardTitle>
                    <CardDescription>{t("PERMISSION_CATALOG_DESCRIPTION")}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {permissions.map((permission) => (
                      <article className="border-t pt-3" key={permission.code}>
                        <p className="font-medium">{permission.nameI18N}</p>
                        <p className="text-sm text-muted-foreground">
                          {permission.descriptionI18N}
                        </p>
                      </article>
                    ))}
                  </CardContent>
                </Card>
              </div>
              {action?.kind === "create" ? (
                <CreateRoleDialog
                  open
                  onCompleted={completed}
                  onOpenChange={(open) => !open && setAction(null)}
                  permissions={permissions}
                />
              ) : null}
              {action?.kind === "copy" ? (
                <CreateRoleDialog
                  open
                  onCompleted={completed}
                  onOpenChange={(open) => !open && setAction(null)}
                  permissions={permissions}
                  sourceRole={action.role}
                />
              ) : null}
              {action?.kind === "edit" ? (
                <EditRoleDialog
                  open
                  onCompleted={completed}
                  onOpenChange={(open) => !open && setAction(null)}
                  permissions={permissions}
                  role={action.role}
                />
              ) : null}
              {action?.kind === "retire" ? (
                <RetireRoleDialog
                  open
                  onCompleted={completed}
                  onOpenChange={(open) => !open && setAction(null)}
                  permissions={permissions}
                  role={action.role}
                />
              ) : null}
            </>
          );
        }}
      </AccessQueryState>
    </AccessPage>
  );
}
