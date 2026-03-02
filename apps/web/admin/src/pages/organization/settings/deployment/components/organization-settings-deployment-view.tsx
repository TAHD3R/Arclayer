import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Button, Form, Input } from "antd";
import * as React from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { getMyOrganization } from "@/api/me";
import { reinitializeSelfHostSystem } from "@/api/system";
import { ContentGuard } from "@/components/common/content-guard";
import { DefaultPage } from "@/components/common/default-page";
import { ChromeTabs, ChromeTabsContent } from "@/components/ui/chrome-tabs";
import { SettingActionItem } from "@/components/settings-primitives/setting-action-item";
import { SettingDialog } from "@/components/settings-primitives/setting-dialog";
import { SettingPanel } from "@/components/settings-primitives/setting-panel";
import { useSystemRuntime } from "@/hooks/use-system-runtime";
import { useSavingKey } from "@/hooks/use-saving-key";
import { ApiError } from "@/lib/http";
import { notifyError } from "@/lib/notifications";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

import type { OrganizationSettingsTabKey } from "../../types";
import { resolveOrganizationSettingsTabNavigation } from "../../utils";
import { OrganizationSettingsTabs } from "../../components/organization-settings-tabs";
import { DeploymentSettingsTab } from "./deployment-settings-tab";

type ReinitializeDialogValues = { confirmName: string };

export function OrganizationSettingsDeploymentView(props: { organizationId: string }) {
  const organizationId = String(props.organizationId || "").trim();
  const tab: OrganizationSettingsTabKey = "deployment";
  const { t } = useTranslation(["settings", "common"]);
  const navigate = useNavigate();
  const runtime = useSystemRuntime();
  const clearAuth = useAuthStore((s) => s.clear);
  const clearWorkspace = useWorkspaceStore((s) => s.clearWorkspace);
  const sessionVersion = useAuthStore((s) => s.sessionVersion);

  const [reinitializeDialogForm] = Form.useForm<ReinitializeDialogValues>();
  const { savingKey, withSavingKey } = useSavingKey();
  const [reinitializeDialogOpen, setReinitializeDialogOpen] = React.useState(false);

  React.useEffect(() => {
    if (runtime.deploymentSettingsEnabled) return;
    void navigate({
      ...resolveOrganizationSettingsTabNavigation(organizationId, "basics"),
      replace: true,
    });
  }, [navigate, organizationId, runtime.deploymentSettingsEnabled]);

  const onTabChange = React.useCallback(
    (next: OrganizationSettingsTabKey) => {
      void navigate({
        ...resolveOrganizationSettingsTabNavigation(organizationId, next),
      });
    },
    [navigate, organizationId],
  );

  const closeReinitializeDialog = React.useCallback(() => {
    reinitializeDialogForm.resetFields();
    setReinitializeDialogOpen(false);
  }, [reinitializeDialogForm]);

  const myOrgQuery = useQuery({
    queryKey: ["me", "organization", sessionVersion],
    queryFn: async () => getMyOrganization(),
    staleTime: 5 * 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const isOwner = myOrgQuery.data?.membership?.role === "owner";
  const canManageOrganization =
    myOrgQuery.data?.membership?.role === "owner" || myOrgQuery.data?.membership?.role === "admin";

  const reinitializeMutation = useMutation({
    mutationFn: async (input: { confirmName: string }) => reinitializeSelfHostSystem(input),
    onError: (err) => notifyError(err),
  });

  const disabled = myOrgQuery.isFetching || reinitializeMutation.isPending || Boolean(savingKey);

  const persistedOrgName = String(myOrgQuery.data?.organization.name ?? "").trim();

  const dialogFieldLabel = React.useCallback((title: string, description: string) => {
    return (
      <div className="grid gap-1.5">
        <span className="font-semibold text-foreground">{title}</span>
        <span className="text-label-secondary">{description}</span>
      </div>
    );
  }, []);

  const forbiddenError = useMemo(
    () =>
      new ApiError({
        status: 403,
        message: t("common:PAGE_FORBIDDEN_DESC"),
        error: "ORG_ADMIN_REQUIRED",
      }),
    [t],
  );

  if (myOrgQuery.isLoading && !myOrgQuery.data) {
    return (
      <DefaultPage
        title={t("settings:SETTINGS_ORG_TITLE")}
        description={t("settings:SETTINGS_ORG_DESC")}
        width="fixed"
      >
        <ContentGuard loading loadingVariant="form" />
      </DefaultPage>
    );
  }

  if (myOrgQuery.isError) {
    return (
      <DefaultPage
        title={t("settings:SETTINGS_ORG_TITLE")}
        description={t("settings:SETTINGS_ORG_DESC")}
        width="fixed"
      >
        <ContentGuard
          loading={false}
          error={myOrgQuery.error}
          onRetry={() => void myOrgQuery.refetch()}
        />
      </DefaultPage>
    );
  }

  if (!canManageOrganization) {
    return (
      <DefaultPage
        title={t("settings:SETTINGS_ORG_TITLE")}
        description={t("settings:SETTINGS_ORG_DESC")}
        width="fixed"
      >
        <ContentGuard loading={false} error={forbiddenError} hideRetry />
      </DefaultPage>
    );
  }

  return (
    <DefaultPage
      title={t("settings:SETTINGS_ORG_TITLE")}
      description={t("settings:SETTINGS_ORG_DESC")}
      width="fixed"
    >
      <ContentGuard loading={false}>
        <ChromeTabs
          value={tab}
          onValueChange={(next) => onTabChange(next as OrganizationSettingsTabKey)}
        >
          <OrganizationSettingsTabs deploymentEnabled={runtime.deploymentSettingsEnabled} />

          <ChromeTabsContent value="deployment">
            <div className="flex flex-col gap-8">
              <DeploymentSettingsTab />

              {runtime.runtime.deploymentMode === "self_host" ? (
                <SettingPanel
                  title={t("settings:SETTINGS_ORG_REINITIALIZE_TITLE")}
                  description={t("settings:SETTINGS_ORG_REINITIALIZE_DESC")}
                >
                  <div className="divide-y">
                    <SettingActionItem
                      title={t("settings:SETTINGS_ORG_REINITIALIZE_TITLE")}
                      description={t("settings:SETTINGS_ORG_REINITIALIZE_DESC")}
                      showSummary={false}
                      disabled={disabled || !isOwner}
                      onTrigger={() => {
                        reinitializeDialogForm.resetFields();
                        setReinitializeDialogOpen(true);
                      }}
                    />
                  </div>
                </SettingPanel>
              ) : null}
            </div>
          </ChromeTabsContent>
        </ChromeTabs>

        <SettingDialog
          open={reinitializeDialogOpen}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) closeReinitializeDialog();
          }}
          title={t("settings:SETTINGS_ORG_REINITIALIZE_TITLE")}
          description={t("settings:SETTINGS_ORG_REINITIALIZE_DESC")}
          footer={
            <div className="flex w-full justify-end gap-2">
              <Button type="text" onClick={closeReinitializeDialog}>
                {t("common:CANCEL")}
              </Button>
              <Button
                type="primary"
                danger
                loading={savingKey === "organization:reinitialize"}
                disabled={disabled || !isOwner}
                onClick={() => {
                  void withSavingKey("organization:reinitialize", async () => {
                    const values = await reinitializeDialogForm.validateFields();
                    await reinitializeMutation.mutateAsync({
                      confirmName: String(values.confirmName || "").trim(),
                    });
                    closeReinitializeDialog();
                    clearAuth();
                    clearWorkspace();
                    await navigate({ to: "/setup", replace: true });
                  });
                }}
              >
                {t("settings:SETTINGS_ORG_REINITIALIZE_CONFIRM_BUTTON")}
              </Button>
            </div>
          }
        >
          <Form
            form={reinitializeDialogForm}
            layout="vertical"
            requiredMark={false}
            autoComplete="off"
          >
            <Form.Item
              name="confirmName"
              label={dialogFieldLabel(
                t("settings:SETTINGS_DIALOG_CONFIRM_NAME_LABEL"),
                t("settings:SETTINGS_ORG_REINITIALIZE_CONFIRM_REQUIRED"),
              )}
              rules={[
                {
                  required: true,
                  message: t("settings:SETTINGS_ORG_REINITIALIZE_CONFIRM_REQUIRED"),
                },
                {
                  validator: async (_, value) => {
                    if (String(value || "").trim() === persistedOrgName) {
                      return;
                    }
                    throw new Error(t("settings:SETTINGS_ORG_REINITIALIZE_CONFIRM_MISMATCH"));
                  },
                },
              ]}
              style={{ marginBottom: 0 }}
            >
              <Input
                size="large"
                placeholder={t("settings:SETTINGS_ORG_REINITIALIZE_CONFIRM_PLACEHOLDER")}
              />
            </Form.Item>
          </Form>
        </SettingDialog>
      </ContentGuard>
    </DefaultPage>
  );
}
