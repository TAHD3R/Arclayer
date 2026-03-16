import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { Switch } from "@celestial/ui/switch";

import { getCoreSettings, patchCoreSettings } from "@/api/settings";
import { ContentGuard } from "@/components/common/content-guard";
import { NumberInput } from "@/components/ui/number-input";
import { DefaultPage } from "@/components/common/default-page";
import { Accordion } from "@celestial/ui/accordion";
import { ChromeTabs, ChromeTabsContent } from "@celestial/ui/chrome-tabs";
import { SettingAccordionItem } from "@celestial/ui/setting-accordion-item";
import { SettingPanel } from "@celestial/ui/setting-panel";
import { useSavingKey } from "@celestial/hooks/use-saving-key";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import {
  buildWorkspaceContentAutosavePatch,
  buildWorkspaceContentRetentionPatch,
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

function FieldMessage({ message }: { message: string | undefined }) {
  if (!message) return null;
  return <div className="text-footnote text-destructive">{message}</div>;
}

export function WorkspaceSettingsContentStrategyView(props: { workspaceId: string }) {
  const workspaceId = String(props.workspaceId || "").trim();
  const { t } = useTranslation(["settings", "common"]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { savingKey, withSavingKey } = useSavingKey();

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

  const form = useForm<FormValues>({
    defaultValues: {
      contentAutosaveEnabled: persistedContentStrategy.autosave.enabled,
      contentAutosaveIntervalSec: persistedContentStrategy.autosave.intervalSec,
      contentAutosaveSaveOnBlur: persistedContentStrategy.autosave.saveOnBlur,
      contentRetentionDraftMaxRevisions: persistedContentStrategy.retention.draftMaxRevisions,
    },
  });

  React.useEffect(() => {
    if (!coreQuery.data) return;
    if (Object.keys(form.formState.dirtyFields).length > 0) return;
    const policy = readWorkspaceContentStrategy(coreQuery.data.value);
    form.reset({
      contentAutosaveEnabled: policy.autosave.enabled,
      contentAutosaveIntervalSec: policy.autosave.intervalSec,
      contentAutosaveSaveOnBlur: policy.autosave.saveOnBlur,
      contentRetentionDraftMaxRevisions: policy.retention.draftMaxRevisions,
    });
  }, [coreQuery.data, form]);

  const autosaveEnabled =
    useWatch({ control: form.control, name: "contentAutosaveEnabled" }) ??
    persistedContentStrategy.autosave.enabled;
  const autosaveIntervalSec =
    useWatch({ control: form.control, name: "contentAutosaveIntervalSec" }) ??
    persistedContentStrategy.autosave.intervalSec;
  const autosaveSaveOnBlur =
    useWatch({ control: form.control, name: "contentAutosaveSaveOnBlur" }) ??
    persistedContentStrategy.autosave.saveOnBlur;
  const retentionDraftMaxRevisions =
    useWatch({ control: form.control, name: "contentRetentionDraftMaxRevisions" }) ??
    persistedContentStrategy.retention.draftMaxRevisions;
  const isAutosaveDirty =
    autosaveEnabled !== persistedContentStrategy.autosave.enabled ||
    autosaveIntervalSec !== persistedContentStrategy.autosave.intervalSec ||
    autosaveSaveOnBlur !== persistedContentStrategy.autosave.saveOnBlur;
  const isRetentionDirty =
    retentionDraftMaxRevisions !== persistedContentStrategy.retention.draftMaxRevisions;
  const onTabChange = React.useCallback(
    (next: WorkspaceSettingsTabKey) => {
      void navigate({
        ...resolveWorkspaceSettingsTabNavigation(workspaceId, next),
      });
    },
    [navigate, workspaceId],
  );

  const patchWorkspaceCoreMutation = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => patchCoreSettings(workspaceId, patch),
    onSuccess: async () => {
      notifySuccessText(t("settings:SETTINGS_SAVED"));
      await queryClient.invalidateQueries({
        queryKey: ["settings", "workspace", "core", workspaceId],
      });
    },
    onError: (error) => notifyError(error),
  });

  const disabled =
    coreQuery.isFetching || patchWorkspaceCoreMutation.isPending || Boolean(savingKey);

  const submitAutosave = form.handleSubmit(async (values) => {
    await patchWorkspaceCoreMutation.mutateAsync(
      buildWorkspaceContentAutosavePatch({
        enabled: Boolean(values.contentAutosaveEnabled),
        intervalSec: Number(values.contentAutosaveIntervalSec),
        saveOnBlur: Boolean(values.contentAutosaveSaveOnBlur),
      }),
    );
  });

  const submitRetention = form.handleSubmit(async (values) => {
    await patchWorkspaceCoreMutation.mutateAsync(
      buildWorkspaceContentRetentionPatch({
        draftMaxRevisions: Number(values.contentRetentionDraftMaxRevisions),
      }),
    );
  });

  const autosaveIntervalError = form.formState.errors.contentAutosaveIntervalSec?.message;
  const retentionError = form.formState.errors.contentRetentionDraftMaxRevisions?.message;

  return (
    <DefaultPage
      title={t("settings:SETTINGS_WORKSPACE_TITLE")}
      description={t("settings:SETTINGS_WORKSPACE_DESC")}
    >
      <ContentGuard
        loading={Boolean(coreQuery.isLoading && !coreQuery.data)}
        loadingVariant="form"
        error={coreQuery.isError ? coreQuery.error : null}
        onRetry={() => void coreQuery.refetch()}
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
                  confirmText={t("settings:SETTINGS_SAVE")}
                  confirmLoading={savingKey === "workspace:content_strategy:autosave"}
                  onConfirm={() =>
                    void withSavingKey("workspace:content_strategy:autosave", async () => {
                      await submitAutosave();
                    })
                  }
                  onReset={
                    isAutosaveDirty
                      ? () =>
                          void withSavingKey("reset:content_strategy:autosave", async () => {
                            form.setValue(
                              "contentAutosaveEnabled",
                              persistedContentStrategy.autosave.enabled,
                              { shouldDirty: false },
                            );
                            form.setValue(
                              "contentAutosaveIntervalSec",
                              persistedContentStrategy.autosave.intervalSec,
                              { shouldDirty: false },
                            );
                            form.setValue(
                              "contentAutosaveSaveOnBlur",
                              persistedContentStrategy.autosave.saveOnBlur,
                              { shouldDirty: false },
                            );
                            await patchWorkspaceCoreMutation.mutateAsync(
                              buildWorkspaceContentAutosavePatch(persistedContentStrategy.autosave),
                            );
                          })
                      : undefined
                  }
                  resetText={t("settings:SETTINGS_RESET")}
                  resetLoading={savingKey === "reset:content_strategy:autosave"}
                  keepRendered
                >
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-body text-label-primary">
                          {t("settings:SETTINGS_WORKSPACE_CONTENT_AUTOSAVE_ENABLED_LABEL")}
                        </div>
                        <div className="text-callout text-label-secondary">
                          {t("settings:SETTINGS_WORKSPACE_CONTENT_AUTOSAVE_ENABLED_DESC")}
                        </div>
                      </div>
                      <Controller
                        control={form.control}
                        name="contentAutosaveEnabled"
                        render={({ field }) => (
                          <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
                        )}
                      />
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-body text-label-primary">
                          {t("settings:SETTINGS_WORKSPACE_CONTENT_AUTOSAVE_INTERVAL_LABEL")}
                        </div>
                        <div className="text-callout text-label-secondary">
                          {t("settings:SETTINGS_WORKSPACE_CONTENT_AUTOSAVE_INTERVAL_DESC")}
                        </div>
                      </div>
                      <Controller
                        control={form.control}
                        name="contentAutosaveIntervalSec"
                        rules={{
                          required: t(
                            "settings:SETTINGS_WORKSPACE_CONTENT_AUTOSAVE_INTERVAL_REQUIRED",
                          ),
                          min: {
                            value: 10,
                            message: t(
                              "settings:SETTINGS_WORKSPACE_CONTENT_AUTOSAVE_INTERVAL_REQUIRED",
                            ),
                          },
                          max: {
                            value: 300,
                            message: t(
                              "settings:SETTINGS_WORKSPACE_CONTENT_AUTOSAVE_INTERVAL_REQUIRED",
                            ),
                          },
                        }}
                        render={({ field, fieldState }) => (
                          <div className="w-44 space-y-1">
                            <div className="flex items-center gap-2">
                              <NumberInput
                                value={field.value}
                                min={10}
                                max={300}
                                step={5}
                                disabled={!autosaveEnabled}
                                onValueChange={field.onChange}
                              />
                              <span className="text-footnote text-label-secondary">
                                {t("settings:SETTINGS_SECONDS")}
                              </span>
                            </div>
                            <FieldMessage
                              message={fieldState.error?.message ?? autosaveIntervalError}
                            />
                          </div>
                        )}
                      />
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-body text-label-primary">
                          {t("settings:SETTINGS_WORKSPACE_CONTENT_AUTOSAVE_SAVE_ON_BLUR_LABEL")}
                        </div>
                        <div className="text-callout text-label-secondary">
                          {t("settings:SETTINGS_WORKSPACE_CONTENT_AUTOSAVE_SAVE_ON_BLUR_DESC")}
                        </div>
                      </div>
                      <Controller
                        control={form.control}
                        name="contentAutosaveSaveOnBlur"
                        render={({ field }) => (
                          <Switch
                            checked={Boolean(field.value)}
                            onCheckedChange={field.onChange}
                            disabled={!autosaveEnabled}
                          />
                        )}
                      />
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
                  confirmText={t("settings:SETTINGS_SAVE")}
                  confirmLoading={savingKey === "workspace:content_strategy:retention"}
                  onConfirm={() =>
                    void withSavingKey("workspace:content_strategy:retention", async () => {
                      await submitRetention();
                    })
                  }
                  onReset={
                    isRetentionDirty
                      ? () =>
                          void withSavingKey("reset:content_strategy:retention", async () => {
                            form.setValue(
                              "contentRetentionDraftMaxRevisions",
                              persistedContentStrategy.retention.draftMaxRevisions,
                              { shouldDirty: false },
                            );
                            await patchWorkspaceCoreMutation.mutateAsync(
                              buildWorkspaceContentRetentionPatch(
                                persistedContentStrategy.retention,
                              ),
                            );
                          })
                      : undefined
                  }
                  resetText={t("settings:SETTINGS_RESET")}
                  resetLoading={savingKey === "reset:content_strategy:retention"}
                  keepRendered
                >
                  <div className="flex flex-col gap-2">
                    <div className="text-body text-label-primary">
                      {t("settings:SETTINGS_WORKSPACE_CONTENT_RETENTION_DRAFT_MAX_REVISIONS_LABEL")}
                    </div>
                    <div className="text-callout text-label-secondary">
                      {t("settings:SETTINGS_WORKSPACE_CONTENT_RETENTION_DRAFT_MAX_REVISIONS_DESC")}
                    </div>

                    <Controller
                      control={form.control}
                      name="contentRetentionDraftMaxRevisions"
                      rules={{
                        required: t(
                          "settings:SETTINGS_WORKSPACE_CONTENT_RETENTION_DRAFT_MAX_REVISIONS_REQUIRED",
                        ),
                        min: {
                          value: 1,
                          message: t(
                            "settings:SETTINGS_WORKSPACE_CONTENT_RETENTION_DRAFT_MAX_REVISIONS_REQUIRED",
                          ),
                        },
                        max: {
                          value: 5000,
                          message: t(
                            "settings:SETTINGS_WORKSPACE_CONTENT_RETENTION_DRAFT_MAX_REVISIONS_REQUIRED",
                          ),
                        },
                      }}
                      render={({ field, fieldState }) => (
                        <div className="w-52 space-y-1">
                          <div className="flex items-center gap-2">
                            <NumberInput
                              value={field.value}
                              min={1}
                              max={5000}
                              step={10}
                              onValueChange={field.onChange}
                            />
                            <span className="text-footnote text-label-secondary">
                              {t("settings:SETTINGS_REVISIONS")}
                            </span>
                          </div>
                          <FieldMessage message={fieldState.error?.message ?? retentionError} />
                        </div>
                      )}
                    />
                  </div>
                </SettingAccordionItem>
              </Accordion>
            </SettingPanel>
          </ChromeTabsContent>
        </ChromeTabs>
      </ContentGuard>
    </DefaultPage>
  );
}
