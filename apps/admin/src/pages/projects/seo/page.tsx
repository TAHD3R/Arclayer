import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";

import { getProjectCoreSettings, patchProjectCoreSettings } from "@/api/settings";
import { AccessNoticeAlert } from "@/components/common/access-notice-alert";
import { useProjectPermissionAccess } from "@/hooks/use-workspace-permission-access";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { pickBool, pickString } from "@/lib/settings/general/utils";
import {
  SystemSettingField,
  SystemSettingFooterActions,
  SystemSettingItem,
  SystemSettingRow,
  SystemSettingStack,
} from "@/pages/system/components/system-setting-item";
import type { JsonValueInput } from "@arclayer/openapi/admin-types";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { Switch } from "@arclayer/ui/switch";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@arclayer/ui/empty";

type GoogleAnalyticsFormValues = {
  enabled: boolean;
  measurementId: string;
};

function buildGoogleAnalyticsInitialValues(input: unknown): GoogleAnalyticsFormValues {
  const value =
    input && typeof input === "object" && "value" in input
      ? (input as { value?: unknown }).value
      : undefined;
  const measurementId =
    pickString(value, ["analytics", "google_analytics", "measurement_id"]) ??
    pickString(value, ["seo", "google_analytics_measurement_id"]) ??
    "";
  return {
    enabled:
      pickBool(value, ["analytics", "google_analytics", "enabled"]) ?? Boolean(measurementId),
    measurementId,
  };
}

function validateGoogleAnalyticsMeasurementId(value: string): boolean {
  const normalized = value.trim().toUpperCase();
  return /^G-[A-Z0-9]{4,}$/.test(normalized);
}

export function ProjectGoogleAnalyticsPage(props: { projectId: string }) {
  const { t } = useTranslation(["account", "settings", "nav"]);
  const queryClient = useQueryClient();
  const permissionAccess = useProjectPermissionAccess(props.projectId);

  const projectCoreQuery = useQuery({
    queryKey: ["settings", "project", "core", props.projectId],
    enabled: Boolean(props.projectId),
    queryFn: async () => getProjectCoreSettings(props.projectId),
    staleTime: 5 * 60 * 1000,
    meta: { silent: true },
  });

  const initialValues = useMemo(
    () => buildGoogleAnalyticsInitialValues(projectCoreQuery.data),
    [projectCoreQuery.data],
  );
  const form = useForm<GoogleAnalyticsFormValues>({
    defaultValues: initialValues,
    mode: "onSubmit",
  });
  const values = form.watch();
  const dirty =
    values.enabled !== initialValues.enabled ||
    values.measurementId !== initialValues.measurementId;
  const normalizedMeasurementId = String(values.measurementId || "")
    .trim()
    .toUpperCase();
  const runtimeReady = Boolean(
    values.enabled && validateGoogleAnalyticsMeasurementId(normalizedMeasurementId),
  );
  useEffect(() => {
    if (!projectCoreQuery.data) return;
    if (form.formState.isDirty) return;
    form.reset(initialValues);
  }, [form, initialValues, projectCoreQuery.data]);

  const patchMutation = useMutation({
    mutationFn: async (patch: Record<string, JsonValueInput>) =>
      patchProjectCoreSettings(props.projectId, patch),
    onSuccess: async () => {
      notifySuccessText(t("settings:SETTINGS_SAVED"));
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["settings", "project", "core", props.projectId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["project", "source", props.projectId],
        }),
      ]);
    },
    onError: (error) => notifyError(error),
  });

  const permissionReady =
    permissionAccess.authzQuery.isFetched && permissionAccess.actionsQuery.isFetched;
  const canManageSettings =
    permissionReady && permissionAccess.hasAction("project:settings:manage");
  const showSetupEmptyState =
    !initialValues.enabled && !initialValues.measurementId && !dirty && permissionReady;
  const disabled = projectCoreQuery.isFetching || patchMutation.isPending || !canManageSettings;
  const measurementIdError = form.formState.errors.measurementId?.message ?? null;
  const loadError = projectCoreQuery.isError
    ? projectCoreQuery.error
    : !projectCoreQuery.isLoading && !projectCoreQuery.data
      ? new Error(t("settings:SETTINGS_LOAD_FAILED_DESC"))
      : null;

  const persist = async () => {
    const nextEnabled = Boolean(form.getValues("enabled"));
    const nextMeasurementId = String(form.getValues("measurementId") || "")
      .trim()
      .toUpperCase();
    if (nextEnabled && !validateGoogleAnalyticsMeasurementId(nextMeasurementId)) {
      form.setError("measurementId", {
        type: "validate",
        message: t("account:PROJECT_SEO_GOOGLE_ANALYTICS_MEASUREMENT_INVALID"),
      });
      return;
    }
    form.clearErrors("measurementId");
    await patchMutation.mutateAsync({
      analytics: {
        google_analytics: {
          enabled: nextEnabled,
          measurement_id: nextMeasurementId || null,
        },
      },
    });
    form.reset({
      enabled: nextEnabled,
      measurementId: nextMeasurementId,
    });
  };

  return (
    <DefaultPage
      title={t("nav:NAV_GOOGLE_ANALYTICS")}
      description={t("account:PROJECT_SEO_GOOGLE_ANALYTICS_DESC")}
      showFavoriteToggle={false}
      headerBehavior="sticky"
      contentContainerClassName="min-h-full [--page-sticky-header-height:6rem]"
    >
      <ContentGuard
        loading={projectCoreQuery.isLoading && !projectCoreQuery.data}
        loadingVariant="form"
        error={loadError}
        onRetry={loadError ? () => void projectCoreQuery.refetch() : undefined}
      >
        {permissionReady && !canManageSettings ? (
          <AccessNoticeAlert
            className="mb-6"
            description={t("account:PROJECT_SEO_GOOGLE_ANALYTICS_READ_ONLY_DESC")}
          />
        ) : null}
        <SystemSettingStack>
          {showSetupEmptyState ? (
            <Empty className="min-h-72 border border-dashed border-border bg-background">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <BarChart3 className="size-6" />
                </EmptyMedia>
                <EmptyTitle className="text-title3">
                  {t("account:PROJECT_SEO_GOOGLE_ANALYTICS_EMPTY_TITLE")}
                </EmptyTitle>
                <EmptyDescription className="text-footnote">
                  {t("account:PROJECT_SEO_GOOGLE_ANALYTICS_EMPTY_DESC")}
                </EmptyDescription>
              </EmptyHeader>
              {canManageSettings ? (
                <EmptyContent>
                  <Button
                    type="button"
                    onClick={() =>
                      document.getElementById("google-analytics-measurement-id")?.focus()
                    }
                  >
                    {t("account:PROJECT_SEO_GOOGLE_ANALYTICS_EMPTY_ACTION")}
                  </Button>
                </EmptyContent>
              ) : null}
            </Empty>
          ) : null}
          <SystemSettingItem
            id="google-analytics"
            title={t("nav:NAV_GOOGLE_ANALYTICS")}
            description={t("account:PROJECT_SEO_GOOGLE_ANALYTICS_PANEL_DESC")}
            footer={
              <SystemSettingFooterActions
                dirty={dirty}
                pending={patchMutation.isPending}
                onReset={() => {
                  form.reset(initialValues);
                  form.clearErrors("measurementId");
                }}
                onSave={() => void persist()}
              />
            }
          >
            <div className="grid gap-3">
              <SystemSettingRow
                title={t("account:PROJECT_SEO_GOOGLE_ANALYTICS_ENABLE_TITLE")}
                description={t("account:PROJECT_SEO_GOOGLE_ANALYTICS_ENABLE_DESC")}
                control={
                  <Switch
                    checked={Boolean(values.enabled)}
                    disabled={disabled}
                    onCheckedChange={(checked) =>
                      form.setValue("enabled", Boolean(checked), { shouldDirty: true })
                    }
                  />
                }
              />
              <SystemSettingField
                label={t("account:PROJECT_SEO_GOOGLE_ANALYTICS_MEASUREMENT_LABEL")}
                description={t("account:PROJECT_SEO_GOOGLE_ANALYTICS_MEASUREMENT_DESC")}
                message={
                  measurementIdError ? (
                    <span className="text-footnote text-destructive">{measurementIdError}</span>
                  ) : null
                }
              >
                <Input
                  id="google-analytics-measurement-id"
                  {...form.register("measurementId")}
                  disabled={disabled}
                  placeholder="G-XXXXXXXXXX"
                  autoCapitalize="characters"
                  autoComplete="off"
                  onChange={(event) => {
                    form.setValue("measurementId", event.target.value.toUpperCase(), {
                      shouldDirty: true,
                    });
                    form.clearErrors("measurementId");
                  }}
                />
              </SystemSettingField>
            </div>
          </SystemSettingItem>
          <SystemSettingItem
            id="analytics-runtime-linkage"
            title={t("account:PROJECT_SEO_GOOGLE_ANALYTICS_RUNTIME_TITLE")}
            description={t("account:PROJECT_SEO_GOOGLE_ANALYTICS_RUNTIME_DESC")}
          >
            <div className="grid gap-2" data-testid="google-analytics-runtime-linkage">
              <SystemSettingRow
                title={t("account:PROJECT_SEO_GOOGLE_ANALYTICS_RUNTIME_STATUS_TITLE")}
                description={
                  runtimeReady
                    ? t("account:PROJECT_SEO_GOOGLE_ANALYTICS_RUNTIME_STATUS_READY_DESC")
                    : t("account:PROJECT_SEO_GOOGLE_ANALYTICS_RUNTIME_STATUS_MISSING_DESC")
                }
                control={
                  <span
                    className={
                      runtimeReady
                        ? "rounded-sm border border-positive/30 bg-positive/5 px-2 py-0.5 text-caption font-medium text-positive"
                        : "rounded-sm border border-warning/30 bg-warning/5 px-2 py-0.5 text-caption font-medium text-warning"
                    }
                  >
                    {runtimeReady
                      ? t("account:PROJECT_SEO_GOOGLE_ANALYTICS_RUNTIME_STATUS_READY")
                      : t("account:PROJECT_SEO_GOOGLE_ANALYTICS_RUNTIME_STATUS_MISSING")}
                  </span>
                }
              />
              <SystemSettingRow
                title={t("account:PROJECT_SEO_GOOGLE_ANALYTICS_RUNTIME_SOURCE_TITLE")}
                description={t("account:PROJECT_SEO_GOOGLE_ANALYTICS_RUNTIME_SOURCE_DESC")}
              />
              <SystemSettingRow
                title={t("account:PROJECT_SEO_GOOGLE_ANALYTICS_RUNTIME_SEO_TITLE")}
                description={t("account:PROJECT_SEO_GOOGLE_ANALYTICS_RUNTIME_SEO_DESC")}
              />
            </div>
          </SystemSettingItem>
        </SystemSettingStack>
      </ContentGuard>
    </DefaultPage>
  );
}
