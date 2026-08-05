import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, CheckCircle2, CircleAlert, Globe2 } from "lucide-react";

import { getProjectCoreSettings, patchProjectCoreSettings } from "@/api/settings";
import { listProjectDomains } from "@/api/project-settings";
import { AccessNoticeAlert } from "@/components/common/access-notice-alert";
import { useProjectPermissionAccess } from "@/hooks/use-workspace-permission-access";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { pickBool, pickString } from "@/lib/settings/general/utils";
import type { JsonValueInput } from "@arclayer/openapi";
import { Button } from "@arclayer/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@arclayer/ui/empty";
import { Input } from "@arclayer/ui/input";
import { Switch } from "@arclayer/ui/switch";

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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const permissionAccess = useProjectPermissionAccess(props.projectId);

  const projectCoreQuery = useQuery({
    queryKey: ["settings", "project", "core", props.projectId],
    enabled: Boolean(props.projectId),
    queryFn: async () => getProjectCoreSettings(props.projectId),
    staleTime: 5 * 60 * 1000,
    meta: { silent: true },
  });

  const domainsQuery = useQuery({
    queryKey: ["project", "domains", props.projectId, "google-analytics-prerequisite"],
    enabled: Boolean(props.projectId),
    queryFn: async () => listProjectDomains(props.projectId),
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
  const disabled = projectCoreQuery.isFetching || patchMutation.isPending || !canManageSettings;
  const measurementIdError = form.formState.errors.measurementId?.message ?? null;
  const loadError = projectCoreQuery.isError
    ? projectCoreQuery.error
    : domainsQuery.isError
      ? domainsQuery.error
      : !projectCoreQuery.isLoading && !projectCoreQuery.data
        ? new Error(t("settings:SETTINGS_LOAD_FAILED_DESC"))
        : null;
  const hasCustomDomain = Boolean(
    domainsQuery.data?.some(
      (domain) => domain.source === "custom" && domain.isVerified && domain.isActive,
    ),
  );

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
      headerBehavior="sticky"
      contentContainerClassName="[--page-sticky-header-height:6rem]"
    >
      <ContentGuard
        loading={
          (projectCoreQuery.isLoading && !projectCoreQuery.data) ||
          (domainsQuery.isLoading && !domainsQuery.data)
        }
        loadingVariant="form"
        error={loadError}
        onRetry={loadError ? () => void projectCoreQuery.refetch() : undefined}
      >
        {!hasCustomDomain ? (
          <Empty className="min-h-[28rem]" data-testid="google-analytics-domain-required">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Globe2 />
              </EmptyMedia>
              <EmptyTitle>
                {t("account:PROJECT_SEO_GOOGLE_ANALYTICS_DOMAIN_REQUIRED_TITLE")}
              </EmptyTitle>
              <EmptyDescription>
                {t("account:PROJECT_SEO_GOOGLE_ANALYTICS_DOMAIN_REQUIRED_DESC")}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                type="button"
                onClick={() =>
                  void navigate({
                    to: "/projects/$projectId/website/project-releases",
                    params: { projectId: props.projectId },
                  })
                }
              >
                {t("account:PROJECT_SEO_GOOGLE_ANALYTICS_DOMAIN_REQUIRED_ACTION")}
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <>
            {permissionReady && !canManageSettings ? (
              <AccessNoticeAlert
                className="mb-6"
                description={t("account:PROJECT_SEO_GOOGLE_ANALYTICS_READ_ONLY_DESC")}
              />
            ) : null}
            <div className="grid gap-8">
              <section
                className="grid border-y border-border md:grid-cols-[minmax(12rem,0.7fr)_minmax(0,1fr)_minmax(0,1fr)]"
                data-testid="google-analytics-runtime-linkage"
              >
                <div className="flex items-start gap-3 px-4 py-4 md:border-r md:border-border">
                  {runtimeReady ? (
                    <CheckCircle2 className="mt-0.5 size-5 text-positive" />
                  ) : (
                    <CircleAlert className="mt-0.5 size-5 text-warning" />
                  )}
                  <div>
                    <div className="text-footnote text-label-secondary">
                      {t("account:PROJECT_SEO_GOOGLE_ANALYTICS_RUNTIME_STATUS_TITLE")}
                    </div>
                    <div className="mt-1 font-semibold text-label-primary">
                      {runtimeReady
                        ? t("account:PROJECT_SEO_GOOGLE_ANALYTICS_RUNTIME_STATUS_READY")
                        : t("account:PROJECT_SEO_GOOGLE_ANALYTICS_RUNTIME_STATUS_MISSING")}
                    </div>
                    <p className="mt-1 text-footnote text-label-secondary">
                      {runtimeReady
                        ? t("account:PROJECT_SEO_GOOGLE_ANALYTICS_RUNTIME_STATUS_READY_DESC")
                        : t("account:PROJECT_SEO_GOOGLE_ANALYTICS_RUNTIME_STATUS_MISSING_DESC")}
                    </p>
                  </div>
                </div>
                <div className="border-t border-border px-4 py-4 md:border-r md:border-t-0">
                  <div className="text-headline font-medium text-label-primary">
                    {t("account:PROJECT_SEO_GOOGLE_ANALYTICS_RUNTIME_SOURCE_TITLE")}
                  </div>
                  <p className="mt-1 text-footnote text-label-secondary">
                    {t("account:PROJECT_SEO_GOOGLE_ANALYTICS_RUNTIME_SOURCE_DESC")}
                  </p>
                </div>
                <div className="border-t border-border px-4 py-4 md:border-t-0">
                  <div className="text-headline font-medium text-label-primary">
                    {t("account:PROJECT_SEO_GOOGLE_ANALYTICS_RUNTIME_SEO_TITLE")}
                  </div>
                  <p className="mt-1 text-footnote text-label-secondary">
                    {t("account:PROJECT_SEO_GOOGLE_ANALYTICS_RUNTIME_SEO_DESC")}
                  </p>
                </div>
              </section>

              <form
                id="google-analytics"
                className="grid gap-6"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (dirty) void persist();
                }}
              >
                <header className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-label-secondary">
                    <BarChart3 aria-hidden="true" size={20} />
                  </div>
                  <div>
                    <h2 className="text-title2 font-semibold text-label-primary">
                      {t("nav:NAV_GOOGLE_ANALYTICS")}
                    </h2>
                    <p className="mt-1 text-body text-label-secondary">
                      {t("account:PROJECT_SEO_GOOGLE_ANALYTICS_PANEL_DESC")}
                    </p>
                  </div>
                </header>

                <div className="flex items-center justify-between gap-4 border-y border-border py-4">
                  <div>
                    <label
                      htmlFor="google-analytics-enabled"
                      className="text-headline font-medium text-label-primary"
                    >
                      {t("account:PROJECT_SEO_GOOGLE_ANALYTICS_ENABLE_TITLE")}
                    </label>
                    <p className="mt-1 text-footnote text-label-secondary">
                      {t("account:PROJECT_SEO_GOOGLE_ANALYTICS_ENABLE_DESC")}
                    </p>
                  </div>
                  <Switch
                    id="google-analytics-enabled"
                    aria-label={t("account:PROJECT_SEO_GOOGLE_ANALYTICS_ENABLE_TITLE")}
                    checked={Boolean(values.enabled)}
                    disabled={disabled}
                    onCheckedChange={(checked) =>
                      form.setValue("enabled", Boolean(checked), { shouldDirty: true })
                    }
                  />
                </div>

                <div className="grid max-w-2xl gap-2">
                  <label
                    htmlFor="google-analytics-measurement-id"
                    className="text-headline font-medium text-label-primary"
                  >
                    {t("account:PROJECT_SEO_GOOGLE_ANALYTICS_MEASUREMENT_LABEL")}
                  </label>
                  <p className="text-footnote text-label-secondary">
                    {t("account:PROJECT_SEO_GOOGLE_ANALYTICS_MEASUREMENT_DESC")}
                  </p>
                  <Input
                    id="google-analytics-measurement-id"
                    {...form.register("measurementId")}
                    disabled={disabled}
                    placeholder="G-XXXXXXXXXX"
                    autoCapitalize="characters"
                    autoComplete="off"
                    aria-invalid={Boolean(measurementIdError)}
                    onChange={(event) => {
                      form.setValue("measurementId", event.target.value.toUpperCase(), {
                        shouldDirty: true,
                      });
                      form.clearErrors("measurementId");
                    }}
                  />
                  {measurementIdError ? (
                    <span className="text-footnote text-destructive">{measurementIdError}</span>
                  ) : null}
                </div>

                <div className="flex justify-end gap-2 border-t border-border pt-4">
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={!dirty || patchMutation.isPending}
                    onClick={() => {
                      form.reset(initialValues);
                      form.clearErrors("measurementId");
                    }}
                  >
                    {t("settings:SETTINGS_RESET")}
                  </Button>
                  <Button
                    type="submit"
                    loading={patchMutation.isPending}
                    disabled={!dirty || disabled}
                  >
                    {t("settings:SETTINGS_SAVE")}
                  </Button>
                </div>
              </form>
            </div>
          </>
        )}
      </ContentGuard>
    </DefaultPage>
  );
}
