import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Form, InputNumber } from "antd";
import * as React from "react";
import { useTranslation } from "react-i18next";

import { Switch } from "@/components/ui/switch";

import { getCoreSettings, patchCoreSettings } from "@/api/settings";
import { ContentGuard } from "@/components/common/content-guard";
import { DefaultPage } from "@/components/common/default-page";
import { Accordion } from "@/components/ui/accordion";
import { ChromeTabs, ChromeTabsContent } from "@/components/ui/chrome-tabs";
import { SettingAccordionItem } from "@/components/settings-primitives/setting-accordion-item";
import { SettingPanel } from "@/components/settings-primitives/setting-panel";
import { useSavingKey } from "@/hooks/use-saving-key";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import {
  buildWorkspaceContentAutosavePatch,
  buildWorkspaceContentRetentionPatch,
  DEFAULT_WORKSPACE_CONTENT_STRATEGY,
  readWorkspaceContentStrategy,
} from "@/lib/settings/workspace/content-strategy";
import type { WorkspaceSettingsTabKey } from "@/types/settings-workspace";

import { WorkspaceSettingsTabs } from "../../components/workspace-settings-tabs";
import { resolveWorkspaceSettingsTabNavigation } from "../../utils";

type FormValues = {
  contentAutosaveEnabled: boolean;
  contentAutosaveIntervalSec: number;
  contentAutosaveSaveOnBlur: boolean;
  contentRetentionDraftMaxRevisions: number;
};

export function WorkspaceSettingsContentStrategyView(props: { workspaceId: string }) {
  const workspaceId = String(props.workspaceId || "").trim();
  const { t } = useTranslation(["settings", "common"]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();
  const autosaveEnabled = Form.useWatch("contentAutosaveEnabled", form);
  const autosaveSaveOnBlur = Form.useWatch("contentAutosaveSaveOnBlur", form);
  const { savingKey, withSavingKey } = useSavingKey();

  const onTabChange = React.useCallback(
    (next: WorkspaceSettingsTabKey) => {
      void navigate({
        ...resolveWorkspaceSettingsTabNavigation(workspaceId, next),
      });
    },
    [navigate, workspaceId],
  );

  const coreQuery = useQuery({
    queryKey: ["settings", "workspace", "core", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => getCoreSettings(workspaceId),
    staleTime: 5 * 60 * 1000,
    meta: { silent: true },
  });

  const persistedContentStrategy = React.useMemo(
    () => readWorkspaceContentStrategy(coreQuery.data?.value),
    [coreQuery.data?.value],
  );

  React.useEffect(() => {
    if (!coreQuery.data) return;
    if (
      form.isFieldTouched("contentAutosaveEnabled") ||
      form.isFieldTouched("contentAutosaveIntervalSec") ||
      form.isFieldTouched("contentAutosaveSaveOnBlur") ||
      form.isFieldTouched("contentRetentionDraftMaxRevisions")
    ) {
      return;
    }
    const policy = readWorkspaceContentStrategy(coreQuery.data.value);
    form.setFieldsValue({
      contentAutosaveEnabled: policy.autosave.enabled,
      contentAutosaveIntervalSec: policy.autosave.intervalSec,
      contentAutosaveSaveOnBlur: policy.autosave.saveOnBlur,
      contentRetentionDraftMaxRevisions: policy.retention.draftMaxRevisions,
    });
  }, [coreQuery.data, form]);

  const patchWorkspaceCoreMutation = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => patchCoreSettings(workspaceId, patch),
    onSuccess: async () => {
      notifySuccessText(t("settings:SETTINGS_SAVED"));
      await queryClient.invalidateQueries({
        queryKey: ["settings", "workspace", "core", workspaceId],
      });
    },
    onError: (err) => notifyError(err),
  });

  const disabled =
    coreQuery.isFetching || patchWorkspaceCoreMutation.isPending || Boolean(savingKey);

  return (
    <DefaultPage
      title={t("settings:SETTINGS_WORKSPACE_TITLE")}
      description={t("settings:SETTINGS_WORKSPACE_DESC")}
      width="fixed"
    >
      <ContentGuard
        loading={Boolean(coreQuery.isLoading && !coreQuery.data)}
        loadingVariant="form"
        error={coreQuery.isError ? coreQuery.error : null}
        onRetry={() => void coreQuery.refetch()}
      >
        <Form<FormValues>
          form={form}
          layout="vertical"
          requiredMark={false}
          autoComplete="off"
          disabled={disabled}
          initialValues={{
            contentAutosaveEnabled: persistedContentStrategy.autosave.enabled,
            contentAutosaveIntervalSec: persistedContentStrategy.autosave.intervalSec,
            contentAutosaveSaveOnBlur: persistedContentStrategy.autosave.saveOnBlur,
            contentRetentionDraftMaxRevisions: persistedContentStrategy.retention.draftMaxRevisions,
          }}
        >
          <ChromeTabs
            value="content_strategy"
            onValueChange={(next) => onTabChange(next as WorkspaceSettingsTabKey)}
          >
            <WorkspaceSettingsTabs />

            <ChromeTabsContent value="content_strategy">
              <SettingPanel
                title={t("settings:SETTINGS_WORKSPACE_TAB_CONTENT_STRATEGY")}
                description={t("settings:SETTINGS_WORKSPACE_CONTENT_STRATEGY_DESC")}
              >
                <Accordion type="single" collapsible className="rounded-lg border border-border">
                  <SettingAccordionItem
                    value="content_autosave"
                    variant="action"
                    title={t("settings:SETTINGS_WORKSPACE_CONTENT_AUTOSAVE_TITLE")}
                    description={t("settings:SETTINGS_WORKSPACE_CONTENT_AUTOSAVE_DESC")}
                    showSummary
                    summary={t("settings:SETTINGS_WORKSPACE_CONTENT_AUTOSAVE_SUMMARY", {
                      enabled: persistedContentStrategy.autosave.enabled
                        ? t("settings:SETTINGS_ENABLED")
                        : t("settings:SETTINGS_DISABLED"),
                      interval: persistedContentStrategy.autosave.intervalSec,
                      saveOnBlur: persistedContentStrategy.autosave.saveOnBlur
                        ? t("settings:SETTINGS_ENABLED")
                        : t("settings:SETTINGS_DISABLED"),
                    })}
                    disabled={disabled || !coreQuery.data}
                    confirmLoading={savingKey === "workspace:content_strategy:autosave"}
                    onConfirm={() =>
                      void withSavingKey("workspace:content_strategy:autosave", async () => {
                        const values = await form.validateFields([
                          "contentAutosaveEnabled",
                          "contentAutosaveIntervalSec",
                          "contentAutosaveSaveOnBlur",
                        ]);

                        await patchWorkspaceCoreMutation.mutateAsync(
                          buildWorkspaceContentAutosavePatch({
                            enabled: Boolean(values.contentAutosaveEnabled),
                            intervalSec: Number(values.contentAutosaveIntervalSec),
                            saveOnBlur: Boolean(values.contentAutosaveSaveOnBlur),
                          }),
                        );
                      })
                    }
                    onReset={() =>
                      void withSavingKey("reset:content_strategy:autosave", async () => {
                        form.setFieldsValue({
                          contentAutosaveEnabled:
                            DEFAULT_WORKSPACE_CONTENT_STRATEGY.autosave.enabled,
                          contentAutosaveIntervalSec:
                            DEFAULT_WORKSPACE_CONTENT_STRATEGY.autosave.intervalSec,
                          contentAutosaveSaveOnBlur:
                            DEFAULT_WORKSPACE_CONTENT_STRATEGY.autosave.saveOnBlur,
                        });
                        await patchWorkspaceCoreMutation.mutateAsync(
                          buildWorkspaceContentAutosavePatch(
                            DEFAULT_WORKSPACE_CONTENT_STRATEGY.autosave,
                          ),
                        );
                      })
                    }
                    resetLoading={savingKey === "reset:content_strategy:autosave"}
                    keepRendered
                  >
                    <div className="flex flex-col gap-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-callout font-medium">
                            {t("settings:SETTINGS_WORKSPACE_CONTENT_AUTOSAVE_ENABLED_LABEL")}
                          </div>
                          <div className="text-caption text-label-secondary">
                            {t("settings:SETTINGS_WORKSPACE_CONTENT_AUTOSAVE_ENABLED_DESC")}
                          </div>
                        </div>
                        <Form.Item name="contentAutosaveEnabled" style={{ marginBottom: 0 }}>
                          <Switch
                            checked={Boolean(autosaveEnabled)}
                            onCheckedChange={(v) => form.setFieldValue("contentAutosaveEnabled", v)}
                          />
                        </Form.Item>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-callout font-medium">
                            {t("settings:SETTINGS_WORKSPACE_CONTENT_AUTOSAVE_INTERVAL_LABEL")}
                          </div>
                          <div className="text-caption text-label-secondary">
                            {t("settings:SETTINGS_WORKSPACE_CONTENT_AUTOSAVE_INTERVAL_DESC")}
                          </div>
                        </div>
                        <Form.Item
                          name="contentAutosaveIntervalSec"
                          rules={[
                            {
                              required: true,
                              message: t(
                                "settings:SETTINGS_WORKSPACE_CONTENT_AUTOSAVE_INTERVAL_REQUIRED",
                              ),
                            },
                          ]}
                          style={{ marginBottom: 0 }}
                        >
                          <InputNumber
                            min={10}
                            max={300}
                            step={5}
                            addonAfter={t("settings:SETTINGS_SECONDS")}
                            disabled={!autosaveEnabled}
                          />
                        </Form.Item>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-callout font-medium">
                            {t("settings:SETTINGS_WORKSPACE_CONTENT_AUTOSAVE_SAVE_ON_BLUR_LABEL")}
                          </div>
                          <div className="text-caption text-label-secondary">
                            {t("settings:SETTINGS_WORKSPACE_CONTENT_AUTOSAVE_SAVE_ON_BLUR_DESC")}
                          </div>
                        </div>
                        <Form.Item name="contentAutosaveSaveOnBlur" style={{ marginBottom: 0 }}>
                          <Switch
                            checked={Boolean(autosaveSaveOnBlur)}
                            onCheckedChange={(v) =>
                              form.setFieldValue("contentAutosaveSaveOnBlur", v)
                            }
                            disabled={!autosaveEnabled}
                          />
                        </Form.Item>
                      </div>
                    </div>
                  </SettingAccordionItem>

                  <SettingAccordionItem
                    value="content_retention"
                    variant="action"
                    title={t("settings:SETTINGS_WORKSPACE_CONTENT_RETENTION_TITLE")}
                    description={t("settings:SETTINGS_WORKSPACE_CONTENT_RETENTION_DESC")}
                    showSummary
                    summary={t("settings:SETTINGS_WORKSPACE_CONTENT_RETENTION_SUMMARY", {
                      count: persistedContentStrategy.retention.draftMaxRevisions,
                    })}
                    disabled={disabled || !coreQuery.data}
                    confirmLoading={savingKey === "workspace:content_strategy:retention"}
                    onConfirm={() =>
                      void withSavingKey("workspace:content_strategy:retention", async () => {
                        const values = await form.validateFields([
                          "contentRetentionDraftMaxRevisions",
                        ]);
                        await patchWorkspaceCoreMutation.mutateAsync(
                          buildWorkspaceContentRetentionPatch({
                            draftMaxRevisions: Number(values.contentRetentionDraftMaxRevisions),
                          }),
                        );
                      })
                    }
                    onReset={() =>
                      void withSavingKey("reset:content_strategy:retention", async () => {
                        form.setFieldValue(
                          "contentRetentionDraftMaxRevisions",
                          DEFAULT_WORKSPACE_CONTENT_STRATEGY.retention.draftMaxRevisions,
                        );
                        await patchWorkspaceCoreMutation.mutateAsync(
                          buildWorkspaceContentRetentionPatch(
                            DEFAULT_WORKSPACE_CONTENT_STRATEGY.retention,
                          ),
                        );
                      })
                    }
                    resetLoading={savingKey === "reset:content_strategy:retention"}
                    keepRendered
                  >
                    <div className="flex flex-col gap-2">
                      <div className="text-callout font-medium">
                        {t(
                          "settings:SETTINGS_WORKSPACE_CONTENT_RETENTION_DRAFT_MAX_REVISIONS_LABEL",
                        )}
                      </div>
                      <div className="text-caption text-label-secondary">
                        {t(
                          "settings:SETTINGS_WORKSPACE_CONTENT_RETENTION_DRAFT_MAX_REVISIONS_DESC",
                        )}
                      </div>

                      <Form.Item
                        name="contentRetentionDraftMaxRevisions"
                        rules={[
                          {
                            required: true,
                            message: t(
                              "settings:SETTINGS_WORKSPACE_CONTENT_RETENTION_DRAFT_MAX_REVISIONS_REQUIRED",
                            ),
                          },
                        ]}
                        style={{ marginBottom: 0 }}
                      >
                        <InputNumber
                          min={1}
                          max={5000}
                          step={10}
                          addonAfter={t("settings:SETTINGS_REVISIONS")}
                        />
                      </Form.Item>
                    </div>
                  </SettingAccordionItem>
                </Accordion>
              </SettingPanel>
            </ChromeTabsContent>
          </ChromeTabs>
        </Form>
      </ContentGuard>
    </DefaultPage>
  );
}
