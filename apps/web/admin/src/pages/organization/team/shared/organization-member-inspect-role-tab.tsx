import { Check, Minus } from "lucide-react";
import { useTranslation } from "react-i18next";

import { PageSkeleton } from "@/components/common/page-skeleton";
import { ContentGuard } from "@/components/common/content-guard";

export type OrganizationMemberInspectRolePermission = {
  code: string;
  displayName: string;
  displayDescription: string | null;
  granted: boolean;
};

type OrganizationMemberInspectRoleTabProps = {
  roleName: string | null;
  roleDescription: string | null;
  permissions: OrganizationMemberInspectRolePermission[];
  rolesLoading: boolean;
  permissionsLoading: boolean;
  rolesError: unknown;
  permissionsError: unknown;
};

export function OrganizationMemberInspectRoleTab({
  roleName,
  roleDescription,
  permissions,
  rolesLoading,
  permissionsLoading,
  rolesError,
  permissionsError,
}: OrganizationMemberInspectRoleTabProps) {
  const { t } = useTranslation(["common", "team"]);

  if (rolesLoading || permissionsLoading) {
    return <PageSkeleton variant="form" />;
  }

  const error = roleName
    ? permissionsError && permissions.length === 0
      ? permissionsError
      : null
    : rolesError || permissionsError;

  return (
    <ContentGuard
      loading={false}
      error={error}
      empty={!roleName}
      emptyTitle={t("common:ORG_MEMBERS_INSPECT_ROLE_EMPTY_TITLE")}
      emptyDescription={t("common:ORG_MEMBERS_INSPECT_ROLE_EMPTY_DESC")}
      variant="compact"
      className="py-4"
    >
      <div className="flex min-h-0 flex-1 flex-col px-8">
        <div className="text-title3 font-semibold">{roleName || "-"}</div>

        <p className="text-label-secondary">
          {roleDescription || t("common:ORG_MEMBERS_INSPECT_ROLE_DESC_EMPTY")}
        </p>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="mb-2 text-title3">{t("team:TEAM_ROLES_COL_PERMISSION")}</div>
          <div className="min-h-0 flex-1 divide-y overflow-auto rounded-md border">
            {permissions.map((permission) => (
              <div key={permission.code} className="grid grid-cols-[1fr_auto] gap-3 px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate font-medium">{permission.displayName}</div>
                  {permission.displayDescription ? (
                    <p className="mt-0.5 line-clamp-2 text-label-secondary">
                      {permission.displayDescription}
                    </p>
                  ) : null}
                </div>
                <div className="pt-1">
                  {permission.granted ? (
                    <Check className="size-4 text-emerald-600" />
                  ) : (
                    <Minus className="size-4 text-label-secondary" />
                  )}
                </div>
              </div>
            ))}

            {!permissions.length ? (
              <div className="px-3 py-6 text-center text-label-secondary">
                {t("common:ORG_MEMBERS_INSPECT_ROLE_PERMISSIONS_EMPTY")}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </ContentGuard>
  );
}
