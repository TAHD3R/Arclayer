import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { getCoreSettings, patchCoreSettings } from "@/api/settings";
import { SettingSwitchBlock } from "@/components/settings/setting-switch-block";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import {
  buildWorkspaceContentStrategyPatch,
  DEFAULT_WORKSPACE_CONTENT_STRATEGY,
  readWorkspaceContentStrategy,
} from "@/lib/settings/workspace-content-strategy";
import { getFieldErrorMessage } from "@/lib/forms/rhf-form-helpers";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import type { WorkspaceSettingsTabKey } from "@/types/settings-workspace";
import { Accordion } from "@arclayer/ui/accordion";
import { ChromeTabs, ChromeTabsContent } from "@arclayer/ui/chrome-tabs";
import { Input } from "@arclayer/ui/input";
import { SettingAccordionItem } from "@arclayer/ui/setting-accordion-item";
import { SettingActionGroup } from "@arclayer/ui/setting-action-group";
import { SettingPanel } from "@arclayer/ui/setting-panel";
import { useSavingKey } from "@arclayer/hooks/use-saving-key";

import { WorkspaceSettingsTabs } from "../../components/workspace-settings-tabs";
import { resolveWorkspaceSettingsTabNavigation } from "../../utils";

type WorkspaceSettingsContentFormValues = {
  autosaveEnabled: boolean;
  autosaveIntervalSec: string;
  autosaveSaveOnBlur: boolean;
  draftMaxRevisions: string;
};

function FieldMessage({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="text-footnote text-destructive">{message}</div>;
}

function normalizePositiveInteger(input: string): number | null {
  const raw = String(input || "").trim();
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed);
}

export function WorkspaceSettingsContentView(props: { workspaceId: string }) {
  const workspaceId = String(props.workspaceId || "").trim();
  const { t } = useTranslation(["settings", "common"]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setCurrentWorkspaceId = useWorkspaceStore((state) => state.setCurrentWorkspaceId);
  const { savingKey, withSavingKey } = useSavingKey();
  const form = useForm<WorkspaceSettingsContentFormValues>({
    defaultValues: {
      autosaveEnabled: DEFAULT_WORKSPACE_CONTENT_STRATEGY.autosave.enabled,
      autosaveIntervalSec: String(DEFAULT_WORKSPACE_CONTENT_STRATEGY.autosave.intervalSec),
      autosaveSaveOnBlur: DEFAULT_WORKSPACE_CONTENT_STRATEGY.autosave.saveOnBlur,
      draftMaxRevisions: String(DEFAULT_WORKSPACE_CONTENT_STRATEGY.retention.draftMaxRevisions),
    },
  });

  React.useEffect(() => {
    if (!workspaceId) return;
    setCurrentWorkspaceId(workspaceId);
  }, [setCurrentWorkspaceId, workspaceId]);

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

  const patchMutation = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => patchCoreSettings(workspaceId, patch),
    onSuccess: async () => {
      notifySuccessText(t("settings:SETTINGS_SAVED"));
      await queryClient.invalidateQueries({
        queryKey: ["settings", "workspace", "core", workspaceId],
      });
    },
    onError: (error) => notifyError(error),
  });

  const strategy = React.useMemo(
    () => readWorkspaceContentStrategy(coreQuery.data?.value),
    [coreQuery.data?.value],
  );

  React.useEffect(() => {
    if (!coreQuery.data) return;
    form.reset({
      autosaveEnabled: strategy.autosave.enabled,
      autosaveIntervalSec: String(strategy.autosave.intervalSec),
      autosaveSaveOnBlur: strategy.autosave.saveOnBlur,
      draftMaxRevisions: String(strategy.retention.draftMaxRevisions),
    });
  }, [coreQuery.data, form, strategy]);

  const autosaveEnabled =
    useWatch({ control: form.control, name: "autosaveEnabled" }) ?? strategy.autosave.enabled;
  const autosaveIntervalSec =
    useWatch({ control: form.control, name: "autosaveIntervalSec" }) ??
    String(strategy.autosave.intervalSec);
  const autosaveSaveOnBlur =
    useWatch({ control: form.control, name: "autosaveSaveOnBlur" }) ?? strategy.autosave.saveOnBlur;
  const draftMaxRevisions =
    useWatch({ control: form.control, name: "draftMaxRevisions" }) ??
    String(strategy.retention.draftMaxRevisions);

  const disabled = coreQuery.isFetching || patchMutation.isPending || Boolean(savingKey);
  const autosaveSummary = t("settings:SETTINGS_WORKSPACE_CONTENT_AUTOSAVE_SUMMARY", {
    enabled: autosaveEnabled ? t("settings:SETTINGS_ENABLED") : t("settings:SETTINGS_DISABLED"),
    interval:
      normalizePositiveInteger(autosaveIntervalSec) ??
      DEFAULT_WORKSPACE_CONTENT_STRATEGY.autosave.intervalSec,
    saveOnBlur: autosaveSaveOnBlur
      ? t("settings:SETTINGS_ENABLED")
      : t("settings:SETTINGS_DISABLED"),
  });
  const retentionSummary = t("settings:SETTINGS_WORKSPACE_CONTENT_RETENTION_SUMMARY", {
    count:
      normalizePositiveInteger(draftMaxRevisions) ??
      DEFAULT_WORKSPACE_CONTENT_STRATEGY.retention.draftMaxRevisions,
  });

  return (
    <DefaultPage
      title={t("settings:SETTINGS_WORKSPACE_TITLE")}
      description={t("settings:SETTINGS_WORKSPACE_DESC")}
    >
      <ContentGuard
        loading={Boolean(coreQuery.isLoading && !coreQuery.data)}
        loadingVariant="form"
        error={coreQuery.error}
        onRetry={() => {
          void coreQuery.refetch();
        }}
      >
        <ChromeTabs
          value="content"
          onValueChange={(next) => onTabChange(next as WorkspaceSettingsTabKey)}
        >
          <WorkspaceSettingsTabs />

          <ChromeTabsContent value="content">
            <SettingPanel
              title={t("settings:SETTINGS_WORKSPACE_CONTENT_STRATEGY_TITLE")}
              description={t("settings:SETTINGS_WORKSPACE_CONTENT_STRATEGY_DESC")}
              bordered={false}
            >
              <SettingActionGroup>
                <Accordion type="single" collapsible className="px-0">
                  <SettingAccordionItem
                    value="workspace_content_autosave"
                    variant="action"
                    title={t("settings:SETTINGS_WORKSPACE_CONTENT_AUTOSAVE_TITLE")}
                    description={t("settings:SETTINGS_WORKSPACE_CONTENT_AUTOSAVE_DESC")}
                    showSummary
                    summary={autosaveSummary}
                    keepRendered
                    disabled={disabled || !coreQuery.data}
                    confirmText={t("settings:SETTINGS_SAVE")}
                    confirmLoading={savingKey === "workspace:content:autosave"}
                    onConfirm={() =>
                      void withSavingKey("workspace:content:autosave", async () => {
                        const values = form.getValues();
                        const intervalSec = normalizePositiveInteger(values.autosaveIntervalSec);
                        if (!intervalSec) {
                          form.setError("autosaveIntervalSec", {
                            message: t(
                              "settings:SETTINGS_WORKSPACE_CONTENT_AUTOSAVE_INTERVAL_REQUIRED",
                            ),
                            type: "manual",
                          });
                          throw new Error("FORM_VALIDATION_FAILED");
                        }

                        form.clearErrors("autosaveIntervalSec");
                        await patchMutation.mutateAsync(
                          buildWorkspaceContentStrategyPatch({
                            autosave: {
                              enabled: Boolean(values.autosaveEnabled),
                              intervalSec,
                              saveOnBlur: Boolean(values.autosaveSaveOnBlur),
                            },
                            retention: strategy.retention,
                          }),
                        );
                      })
                    }
                    onReset={
                      coreQuery.data
                        ? () =>
                            void withSavingKey("reset:workspace:content:autosave", async () => {
                              form.setValue("autosaveEnabled", strategy.autosave.enabled, {
                                shouldDirty: false,
                              });
                              form.setValue(
                                "autosaveIntervalSec",
                                String(strategy.autosave.intervalSec),
                                { shouldDirty: false },
                              );
                              form.setValue("autosaveSaveOnBlur", strategy.autosave.saveOnBlur, {
                                shouldDirty: false,
                              });
                              form.clearErrors("autosaveIntervalSec");
                              await patchMutation.mutateAsync(
                                buildWorkspaceContentStrategyPatch({
                                  autosave: strategy.autosave,
                                  retention: strategy.retention,
                                }),
                              );
                            })
                        : undefined
                    }
                    resetText={t("settings:SETTINGS_RESET")}
                    resetLoading={savingKey === "reset:workspace:content:autosave"}
                  >
                    <div className="space-y-4">
                      <SettingSwitchBlock
                        checked={autosaveEnabled}
                        disabled={disabled}
                        label={t("settings:SETTINGS_WORKSPACE_CONTENT_AUTOSAVE_ENABLED_LABEL")}
                        description={t("settings:SETTINGS_WORKSPACE_CONTENT_AUTOSAVE_ENABLED_DESC")}
                        onCheckedChange={(checked) => {
                          form.setValue("autosaveEnabled", checked, { shouldDirty: true });
                        }}
                      />

                      <div className="space-y-2">
                        <label className="text-body text-label-primary" htmlFor="autosave-interval">
                          {t("settings:SETTINGS_WORKSPACE_CONTENT_AUTOSAVE_INTERVAL_LABEL")}
                        </label>
                        <Input
                          id="autosave-interval"
                          inputMode="numeric"
                          value={autosaveIntervalSec}
                          disabled={disabled}
                          onChange={(event) => {
                            form.setValue("autosaveIntervalSec", event.target.value, {
                              shouldDirty: true,
                            });
                            form.clearErrors("autosaveIntervalSec");
                          }}
                        />
                        <div className="text-callout text-label-secondary">
                          {t("settings:SETTINGS_WORKSPACE_CONTENT_AUTOSAVE_INTERVAL_DESC")}
                        </div>
                        <FieldMessage message={getFieldErrorMessage(form, "autosaveIntervalSec")} />
                      </div>

                      <SettingSwitchBlock
                        checked={autosaveSaveOnBlur}
                        disabled={disabled}
                        label={t("settings:SETTINGS_WORKSPACE_CONTENT_AUTOSAVE_SAVE_ON_BLUR_LABEL")}
                        description={t(
                          "settings:SETTINGS_WORKSPACE_CONTENT_AUTOSAVE_SAVE_ON_BLUR_DESC",
                        )}
                        onCheckedChange={(checked) => {
                          form.setValue("autosaveSaveOnBlur", checked, { shouldDirty: true });
                        }}
                      />
                    </div>
                  </SettingAccordionItem>

                  <SettingAccordionItem
                    value="workspace_content_retention"
                    variant="action"
                    title={t("settings:SETTINGS_WORKSPACE_CONTENT_RETENTION_TITLE")}
                    description={t("settings:SETTINGS_WORKSPACE_CONTENT_RETENTION_DESC")}
                    showSummary
                    summary={retentionSummary}
                    keepRendered
                    disabled={disabled || !coreQuery.data}
                    confirmText={t("settings:SETTINGS_SAVE")}
                    confirmLoading={savingKey === "workspace:content:retention"}
                    onConfirm={() =>
                      void withSavingKey("workspace:content:retention", async () => {
                        const values = form.getValues();
                        const draftRetention = normalizePositiveInteger(values.draftMaxRevisions);
                        if (!draftRetention) {
                          form.setError("draftMaxRevisions", {
                            message: t(
                              "settings:SETTINGS_WORKSPACE_CONTENT_RETENTION_DRAFT_MAX_REVISIONS_REQUIRED",
                            ),
                            type: "manual",
                          });
                          throw new Error("FORM_VALIDATION_FAILED");
                        }

                        form.clearErrors("draftMaxRevisions");
                        await patchMutation.mutateAsync(
                          buildWorkspaceContentStrategyPatch({
                            autosave: {
                              enabled: autosaveEnabled,
                              intervalSec:
                                normalizePositiveInteger(autosaveIntervalSec) ??
                                strategy.autosave.intervalSec,
                              saveOnBlur: autosaveSaveOnBlur,
                            },
                            retention: {
                              draftMaxRevisions: draftRetention,
                            },
                          }),
                        );
                      })
                    }
                    onReset={
                      coreQuery.data
                        ? () =>
                            void withSavingKey("reset:workspace:content:retention", async () => {
                              form.setValue(
                                "draftMaxRevisions",
                                String(strategy.retention.draftMaxRevisions),
                                { shouldDirty: false },
                              );
                              form.clearErrors("draftMaxRevisions");
                              await patchMutation.mutateAsync(
                                buildWorkspaceContentStrategyPatch({
                                  autosave: {
                                    enabled: autosaveEnabled,
                                    intervalSec:
                                      normalizePositiveInteger(autosaveIntervalSec) ??
                                      strategy.autosave.intervalSec,
                                    saveOnBlur: autosaveSaveOnBlur,
                                  },
                                  retention: strategy.retention,
                                }),
                              );
                            })
                        : undefined
                    }
                    resetText={t("settings:SETTINGS_RESET")}
                    resetLoading={savingKey === "reset:workspace:content:retention"}
                  >
                    <div className="space-y-2">
                      <label className="text-body text-label-primary" htmlFor="draft-max-revisions">
                        {t(
                          "settings:SETTINGS_WORKSPACE_CONTENT_RETENTION_DRAFT_MAX_REVISIONS_LABEL",
                        )}
                      </label>
                      <Input
                        id="draft-max-revisions"
                        inputMode="numeric"
                        value={draftMaxRevisions}
                        disabled={disabled}
                        onChange={(event) => {
                          form.setValue("draftMaxRevisions", event.target.value, {
                            shouldDirty: true,
                          });
                          form.clearErrors("draftMaxRevisions");
                        }}
                      />
                      <div className="text-callout text-label-secondary">
                        {t(
                          "settings:SETTINGS_WORKSPACE_CONTENT_RETENTION_DRAFT_MAX_REVISIONS_DESC",
                        )}
                      </div>
                      <FieldMessage message={getFieldErrorMessage(form, "draftMaxRevisions")} />
                    </div>
                  </SettingAccordionItem>
                </Accordion>
              </SettingActionGroup>
            </SettingPanel>
          </ChromeTabsContent>
        </ChromeTabs>
      </ContentGuard>
    </DefaultPage>
  );
}
