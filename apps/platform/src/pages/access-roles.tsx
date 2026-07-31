import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { listPlatformPermissions, listPlatformRoles } from "@/access/access-api";
import { AccessPage, AccessQueryState, ReadOnlyNotice, useAccessQuery } from "@/access/access-ui";
import { Badge } from "@arclayer/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@arclayer/ui/card";

export function PlatformRolesPage() {
  const { t } = useTranslation("access");
  const load = useCallback(
    async () => ({
      roles: await listPlatformRoles(),
      permissions: await listPlatformPermissions(),
    }),
    [],
  );
  const { state, retry } = useAccessQuery(load, []);
  return (
    <AccessPage description={t("ROLES_DESCRIPTION")} title={t("ROLES_TITLE")}>
      <ReadOnlyNotice />
      <AccessQueryState isEmpty={(data) => data.roles.length === 0} retry={retry} state={state}>
        {({ roles, permissions }) => (
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
                      <Badge variant="outline">{t(`ROLE_KIND_${role.kind.toUpperCase()}`)}</Badge>
                    </div>
                    {role.description && (
                      <p className="mt-2 text-footnote text-label-secondary">{role.description}</p>
                    )}
                    <p className="mt-3 text-footnote text-label-secondary">
                      {t("ROLE_PERMISSION_COUNT", { count: role.permissionCodes.length })}
                    </p>
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
                    <p className="text-footnote text-label-secondary">
                      {permission.descriptionI18N}
                    </p>
                  </article>
                ))}
              </CardContent>
            </Card>
          </div>
        )}
      </AccessQueryState>
    </AccessPage>
  );
}
