import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { listWorkspacePermissionActions } from "@/api/rbac";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { TeamRolesPage } from "@/pages/workspaces/team/roles/page";
import type { WorkspacePermissionAction } from "@/types/api/rbac";

type ActionGroup = {
  key: "workspace" | "delivery";
  titleKey: string;
  descriptionKey: string;
  actions: WorkspacePermissionAction[];
};

function resolveActionGroups(actions: WorkspacePermissionAction[]): ActionGroup[] {
  const workspaceActions = actions.filter((action) => action.permissionCodes.length > 0);
  const deliveryActions = actions.filter((action) =>
    action.subjectKinds.includes("delivery_api_key"),
  );

  return [
    {
      key: "workspace",
      titleKey: "settings:SETTINGS_WORKSPACE_PERMISSIONS_SECTION_WORKSPACE_TITLE",
      descriptionKey: "settings:SETTINGS_WORKSPACE_PERMISSIONS_SECTION_WORKSPACE_DESC",
      actions: workspaceActions,
    },
    {
      key: "delivery",
      titleKey: "settings:SETTINGS_WORKSPACE_PERMISSIONS_SECTION_DELIVERY_TITLE",
      descriptionKey: "settings:SETTINGS_WORKSPACE_PERMISSIONS_SECTION_DELIVERY_DESC",
      actions: deliveryActions,
    },
  ];
}

function SummaryStat(props: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border/70 bg-background px-3 py-3">
      <dt className="text-caption font-medium text-label-tertiary">{props.label}</dt>
      <dd className="mt-1 text-title-4 font-semibold text-label-primary">{props.value}</dd>
    </div>
  );
}

export function WorkspacePermissionsSettingsView(props: {
  workspaceId: string;
  createOpen?: boolean;
  onCreateOpenChange?: (open: boolean) => void;
}) {
  const { t } = useTranslation(["settings", "common"]);
  const actionsQuery = useQuery({
    queryKey: ["rbac", "actions", props.workspaceId],
    enabled: Boolean(props.workspaceId),
    queryFn: async () => listWorkspacePermissionActions(props.workspaceId),
    staleTime: 30 * 1000,
    retry: false,
  });

  const actions = actionsQuery.data ?? [];
  const actionGroups = React.useMemo(() => resolveActionGroups(actions), [actions]);
  const permissionBackedCount = React.useMemo(
    () => actions.filter((action) => action.permissionCodes.length > 0).length,
    [actions],
  );
  const deliveryCount = React.useMemo(
    () => actions.filter((action) => action.subjectKinds.includes("delivery_api_key")).length,
    [actions],
  );

  return (
    <div className="flex min-h-0 flex-col gap-5" data-testid="workspace-permissions-settings-view">
      <section className="rounded-2xl border border-border/70 bg-muted/20 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <h2 className="text-headline font-semibold text-label-primary">
              {t("settings:SETTINGS_WORKSPACE_PERMISSIONS_CATALOG_TITLE")}
            </h2>
            <p className="mt-1 text-body text-label-secondary">
              {t("settings:SETTINGS_WORKSPACE_PERMISSIONS_CATALOG_DESC")}
            </p>
          </div>

          <dl className="grid grid-cols-3 gap-3 lg:min-w-[22rem]">
            <SummaryStat
              label={t("settings:SETTINGS_WORKSPACE_PERMISSIONS_SUMMARY_TOTAL")}
              value={actions.length}
            />
            <SummaryStat
              label={t("settings:SETTINGS_WORKSPACE_PERMISSIONS_SUMMARY_WORKSPACE")}
              value={permissionBackedCount}
            />
            <SummaryStat
              label={t("settings:SETTINGS_WORKSPACE_PERMISSIONS_SUMMARY_DELIVERY")}
              value={deliveryCount}
            />
          </dl>
        </div>

        <div className="mt-4">
          <ContentGuard
            loading={Boolean(actionsQuery.isLoading && !actionsQuery.data)}
            error={actionsQuery.error}
            onRetry={() => {
              void actionsQuery.refetch();
            }}
          >
            <div className="grid gap-3 lg:grid-cols-2">
              {actionGroups.map((group) => (
                <section
                  key={group.key}
                  className="rounded-xl border border-border/70 bg-background px-4 py-4"
                >
                  <div>
                    <h3 className="text-callout font-semibold text-label-primary">
                      {t(group.titleKey)}
                    </h3>
                    <p className="mt-1 text-footnote text-label-secondary">
                      {t(group.descriptionKey)}
                    </p>
                  </div>

                  {group.actions.length ? (
                    <ul className="mt-4 space-y-3">
                      {group.actions.map((action) => (
                        <li
                          key={action.code}
                          className="rounded-lg border border-border/60 px-3 py-3"
                        >
                          <div className="text-callout font-medium text-label-primary">
                            {action.code}
                          </div>
                          {action.description ? (
                            <div className="mt-1 text-footnote text-label-secondary">
                              {action.description}
                            </div>
                          ) : null}
                          <div className="mt-3 flex flex-wrap gap-2">
                            {action.permissionCodes.map((code) => (
                              <span
                                key={`${action.code}:${code}`}
                                className="rounded-md border border-border/70 bg-muted/30 px-2 py-1 text-caption text-label-secondary"
                              >
                                {code}
                              </span>
                            ))}
                            {action.subjectKinds.map((kind) => (
                              <span
                                key={`${action.code}:${kind}`}
                                className="rounded-md border border-border/70 px-2 py-1 text-caption text-label-tertiary"
                              >
                                {kind}
                              </span>
                            ))}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="mt-4 text-footnote text-label-secondary">
                      {t("settings:SETTINGS_WORKSPACE_PERMISSIONS_SECTION_EMPTY")}
                    </div>
                  )}
                </section>
              ))}
            </div>
          </ContentGuard>
        </div>
      </section>

      <section className="flex min-h-0 flex-col gap-4">
        <div>
          <h2 className="text-headline font-semibold text-label-primary">
            {t("settings:SETTINGS_WORKSPACE_PERMISSIONS_MATRIX_TITLE")}
          </h2>
          <p className="mt-1 text-body text-label-secondary">
            {t("settings:SETTINGS_WORKSPACE_PERMISSIONS_MATRIX_DESC")}
          </p>
        </div>

        <TeamRolesPage
          workspaceIdOverride={props.workspaceId}
          createOpen={props.createOpen}
          onCreateOpenChange={props.onCreateOpenChange}
          embedded
        />
      </section>
    </div>
  );
}
