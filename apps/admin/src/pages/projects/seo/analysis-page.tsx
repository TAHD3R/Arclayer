import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, CircleDashed } from "lucide-react";
import { useTranslation } from "react-i18next";

import { listProjectDomains, type ProjectDomainBinding } from "@/api/project-settings";
import { getProjectReleaseDryRun, listProjectReleases } from "@/api/project-releases";
import { getProjectCoreSettings } from "@/api/settings";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import { buildGeneralSettingsInitialValues } from "@/lib/settings/general/adapters";
import { pickBool, pickString } from "@/lib/settings/general/utils";
import { cn } from "@arclayer/lib/utils";
import type {
  AdminRelease,
  AdminReleaseDryRun,
  ProjectSettingsDetail,
} from "@arclayer/openapi/admin-types";

type SeoAnalysisStatus = "ready" | "warning" | "missing";

type SeoAnalysisCheck = {
  descriptionKey: string;
  key: string;
  status: SeoAnalysisStatus;
  titleKey: string;
  value?: string;
};

function selectRoutableDomain(
  domains: readonly ProjectDomainBinding[],
): ProjectDomainBinding | null {
  return (
    domains.find((domain) => domain.isPrimary && domain.isVerified && domain.isActive) ??
    domains.find((domain) => domain.isVerified && domain.isActive) ??
    null
  );
}

function selectActiveRelease(releases: readonly AdminRelease[]): AdminRelease | null {
  return releases.find((release) => release.isActive) ?? null;
}

function readAnalyticsSettings(input: unknown): { enabled: boolean; measurementId: string } {
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

function isValidMeasurementId(value: string): boolean {
  return /^G-[A-Z0-9]{4,}$/.test(value.trim().toUpperCase());
}

function statusClassName(status: SeoAnalysisStatus): string {
  switch (status) {
    case "ready":
      return "text-positive";
    case "warning":
      return "text-warning";
    case "missing":
    default:
      return "text-label-secondary";
  }
}

function SeoAnalysisStatusIcon(props: { status: SeoAnalysisStatus }) {
  if (props.status === "ready") return <CheckCircle2 className="size-4" />;
  if (props.status === "warning") return <AlertTriangle className="size-4" />;
  return <CircleDashed className="size-4" />;
}

function buildSeoAnalysisChecks(params: {
  domains: readonly ProjectDomainBinding[];
  projectCoreSettings: ProjectSettingsDetail | undefined;
  releaseDryRun: AdminReleaseDryRun | undefined;
  releases: readonly AdminRelease[];
}): SeoAnalysisCheck[] {
  const settings = buildGeneralSettingsInitialValues({ project: params.projectCoreSettings });
  const domain = selectRoutableDomain(params.domains);
  const activeRelease = selectActiveRelease(params.releases);
  const analytics = readAnalyticsSettings(params.projectCoreSettings);
  const releaseReadiness = params.releaseDryRun?.readinessSummary ?? null;
  const siteUrl = settings.siteUrl.trim();
  const siteDescription = settings.siteDescription.trim();
  const logoReady = Boolean(settings.siteLogoUrl || settings.siteLogoAssetId);
  const faviconReady = Boolean(settings.siteFaviconUrl || settings.siteFaviconAssetId);
  const socialImageReady = Boolean(settings.seoOgImageUrl || settings.seoOgImageAssetId);

  return [
    {
      key: "domain",
      status: domain ? "ready" : "warning",
      titleKey: "account:PROJECT_SEO_ANALYSIS_DOMAIN_TITLE",
      descriptionKey: domain
        ? "account:PROJECT_SEO_ANALYSIS_DOMAIN_READY_DESC"
        : "account:PROJECT_SEO_ANALYSIS_DOMAIN_WARNING_DESC",
      value: domain?.hostname,
    },
    {
      key: "site-url",
      status: siteUrl || domain ? "ready" : "warning",
      titleKey: "account:PROJECT_SEO_ANALYSIS_SITE_URL_TITLE",
      descriptionKey:
        siteUrl || domain
          ? "account:PROJECT_SEO_ANALYSIS_SITE_URL_READY_DESC"
          : "account:PROJECT_SEO_ANALYSIS_SITE_URL_WARNING_DESC",
      value: siteUrl || (domain ? `https://${domain.hostname}` : undefined),
    },
    {
      key: "metadata",
      status: settings.siteName.trim() && siteDescription ? "ready" : "warning",
      titleKey: "account:PROJECT_SEO_ANALYSIS_METADATA_TITLE",
      descriptionKey:
        settings.siteName.trim() && siteDescription
          ? "account:PROJECT_SEO_ANALYSIS_METADATA_READY_DESC"
          : "account:PROJECT_SEO_ANALYSIS_METADATA_WARNING_DESC",
      value: settings.siteName.trim(),
    },
    {
      key: "title-policy",
      status: settings.seoTitlePolicy.parts.length > 0 ? "ready" : "missing",
      titleKey: "account:PROJECT_SEO_ANALYSIS_TITLE_POLICY_TITLE",
      descriptionKey:
        settings.seoTitlePolicy.parts.length > 0
          ? "account:PROJECT_SEO_ANALYSIS_TITLE_POLICY_READY_DESC"
          : "account:PROJECT_SEO_ANALYSIS_TITLE_POLICY_MISSING_DESC",
    },
    {
      key: "brand-assets",
      status: logoReady && faviconReady ? "ready" : "warning",
      titleKey: "account:PROJECT_SEO_ANALYSIS_BRAND_ASSETS_TITLE",
      descriptionKey:
        logoReady && faviconReady
          ? "account:PROJECT_SEO_ANALYSIS_BRAND_ASSETS_READY_DESC"
          : "account:PROJECT_SEO_ANALYSIS_BRAND_ASSETS_WARNING_DESC",
    },
    {
      key: "social-preview",
      status: socialImageReady ? "ready" : "warning",
      titleKey: "account:PROJECT_SEO_ANALYSIS_SOCIAL_PREVIEW_TITLE",
      descriptionKey: socialImageReady
        ? "account:PROJECT_SEO_ANALYSIS_SOCIAL_PREVIEW_READY_DESC"
        : "account:PROJECT_SEO_ANALYSIS_SOCIAL_PREVIEW_WARNING_DESC",
      value: settings.seoOgImageUrl || undefined,
    },
    {
      key: "indexing",
      status: settings.seoIndexingEnabled ? "ready" : "warning",
      titleKey: "account:PROJECT_SEO_ANALYSIS_INDEXING_TITLE",
      descriptionKey: settings.seoIndexingEnabled
        ? "account:PROJECT_SEO_ANALYSIS_INDEXING_READY_DESC"
        : "account:PROJECT_SEO_ANALYSIS_INDEXING_WARNING_DESC",
      value: settings.seoIndexingEnabled ? "index,follow" : "noindex,nofollow",
    },
    {
      key: "sitemap",
      status: settings.seoSitemapEnabled ? "ready" : "warning",
      titleKey: "account:PROJECT_SEO_ANALYSIS_SITEMAP_TITLE",
      descriptionKey: settings.seoSitemapEnabled
        ? "account:PROJECT_SEO_ANALYSIS_SITEMAP_READY_DESC"
        : "account:PROJECT_SEO_ANALYSIS_SITEMAP_WARNING_DESC",
    },
    {
      key: "active-release",
      status: activeRelease ? "ready" : "warning",
      titleKey: "account:PROJECT_SEO_ANALYSIS_RELEASE_TITLE",
      descriptionKey: activeRelease
        ? "account:PROJECT_SEO_ANALYSIS_RELEASE_READY_DESC"
        : "account:PROJECT_SEO_ANALYSIS_RELEASE_WARNING_DESC",
      value: activeRelease ? `#${activeRelease.releaseNumber}` : undefined,
    },
    {
      key: "release-readiness",
      status: releaseReadiness?.ready ? "ready" : "warning",
      titleKey: "account:PROJECT_SEO_ANALYSIS_RELEASE_READINESS_TITLE",
      descriptionKey: releaseReadiness
        ? releaseReadiness.ready
          ? "account:PROJECT_SEO_ANALYSIS_RELEASE_READINESS_READY_DESC"
          : "account:PROJECT_SEO_ANALYSIS_RELEASE_READINESS_BLOCKED_DESC"
        : "account:PROJECT_SEO_ANALYSIS_RELEASE_READINESS_MISSING_DESC",
      value: releaseReadiness
        ? `${releaseReadiness.selectedItemCount ?? 0}/${releaseReadiness.blockedItemCount ?? 0}`
        : undefined,
    },
    {
      key: "analytics",
      status:
        analytics.enabled && isValidMeasurementId(analytics.measurementId) ? "ready" : "missing",
      titleKey: "account:PROJECT_SEO_ANALYSIS_ANALYTICS_TITLE",
      descriptionKey:
        analytics.enabled && isValidMeasurementId(analytics.measurementId)
          ? "account:PROJECT_SEO_ANALYSIS_ANALYTICS_READY_DESC"
          : "account:PROJECT_SEO_ANALYSIS_ANALYTICS_MISSING_DESC",
      value: analytics.measurementId || undefined,
    },
  ];
}

function SeoAnalysisCheckRow(props: { check: SeoAnalysisCheck }) {
  const { t } = useTranslation(["account"]);
  return (
    <li
      className="grid gap-3 px-4 py-4 md:grid-cols-[1.25rem_minmax(12rem,0.7fr)_minmax(0,1fr)] md:items-start"
      data-testid={`seo-analysis-check-${props.check.key}`}
    >
      <div className={cn("mt-0.5 shrink-0", statusClassName(props.check.status))}>
        <SeoAnalysisStatusIcon status={props.check.status} />
      </div>
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-callout font-semibold text-label-primary">
            {t(props.check.titleKey)}
          </span>
          {props.check.value ? (
            <code className="min-w-0 truncate rounded bg-background/70 px-1.5 py-0.5 text-caption text-label-secondary">
              {props.check.value}
            </code>
          ) : null}
        </div>
      </div>
      <p className="text-footnote text-label-secondary">{t(props.check.descriptionKey)}</p>
    </li>
  );
}

export function ProjectSeoAnalysisPage(props: { projectId: string }) {
  const { t } = useTranslation(["account", "nav", "settings"]);
  const projectCoreQuery = useQuery({
    queryKey: ["settings", "project", "core", props.projectId],
    enabled: Boolean(props.projectId),
    queryFn: async () => getProjectCoreSettings(props.projectId),
    staleTime: 5 * 60 * 1000,
    meta: { silent: true },
  });
  const domainsQuery = useQuery({
    queryKey: ["project", "domains", props.projectId],
    enabled: Boolean(props.projectId),
    queryFn: async () => listProjectDomains(props.projectId),
    staleTime: 5 * 60 * 1000,
    meta: { silent: true },
  });
  const releasesQuery = useQuery({
    queryKey: ["project", "releases", props.projectId],
    enabled: Boolean(props.projectId),
    queryFn: async () => listProjectReleases(props.projectId),
    staleTime: 5 * 60 * 1000,
  });
  const releaseDryRunQuery = useQuery({
    queryKey: ["project", "releases", props.projectId, "dry-run"],
    enabled: Boolean(props.projectId),
    queryFn: async () => getProjectReleaseDryRun(props.projectId),
    staleTime: 60 * 1000,
  });

  const checks = useMemo(
    () =>
      buildSeoAnalysisChecks({
        domains: domainsQuery.data ?? [],
        projectCoreSettings: projectCoreQuery.data,
        releaseDryRun: releaseDryRunQuery.data,
        releases: releasesQuery.data ?? [],
      }),
    [domainsQuery.data, projectCoreQuery.data, releaseDryRunQuery.data, releasesQuery.data],
  );
  const readyCount = checks.filter((check) => check.status === "ready").length;
  const warningCount = checks.length - readyCount;
  const primaryDomain = selectRoutableDomain(domainsQuery.data ?? []);
  const queryLoadError = projectCoreQuery.isError
    ? projectCoreQuery.error
    : domainsQuery.isError
      ? domainsQuery.error
      : releasesQuery.isError
        ? releasesQuery.error
        : releaseDryRunQuery.isError
          ? releaseDryRunQuery.error
          : null;
  const loadError =
    queryLoadError ??
    (!projectCoreQuery.isLoading && !projectCoreQuery.data
      ? new Error(t("settings:SETTINGS_LOAD_FAILED_DESC"))
      : null);

  return (
    <DefaultPage
      title={t("nav:NAV_SEO_ANALYSIS")}
      description={t("account:PROJECT_SEO_AUDIT_DESC")}
      headerBehavior="sticky"
      contentContainerClassName="[--page-sticky-header-height:6rem]"
    >
      <ContentGuard
        loading={
          (projectCoreQuery.isLoading && !projectCoreQuery.data) ||
          (domainsQuery.isLoading && !domainsQuery.data) ||
          (releasesQuery.isLoading && !releasesQuery.data) ||
          (releaseDryRunQuery.isLoading && !releaseDryRunQuery.data)
        }
        loadingVariant="form"
        error={loadError}
        onRetry={
          loadError
            ? () =>
                void Promise.all([
                  projectCoreQuery.refetch(),
                  domainsQuery.refetch(),
                  releasesQuery.refetch(),
                  releaseDryRunQuery.refetch(),
                ])
            : undefined
        }
      >
        <div id="seo-analysis" className="grid gap-6">
          <header>
            <h2 className="text-title2 font-semibold text-label-primary">
              {t("nav:NAV_SEO_ANALYSIS")}
            </h2>
            <p className="mt-1 max-w-2xl text-body text-label-secondary">
              {t("account:PROJECT_SEO_AUDIT_PANEL_DESC")}
            </p>
          </header>
          <section
            className="grid border-y border-border md:grid-cols-3"
            aria-label={t("account:PROJECT_SEO_ANALYSIS_SCORE_LABEL")}
          >
            <div className="px-4 py-4 md:border-r md:border-border">
              <div className="text-footnote text-label-secondary">
                {t("account:PROJECT_SEO_ANALYSIS_SCORE_LABEL")}
              </div>
              <div className="mt-1 text-title2 font-semibold text-label-primary">
                {readyCount}/{checks.length}
              </div>
            </div>
            <div className="border-t border-border px-4 py-4 md:border-r md:border-t-0">
              <div className="text-footnote text-label-secondary">
                {t("account:PROJECT_SEO_ANALYSIS_DOMAIN_LABEL")}
              </div>
              <div className="mt-1 truncate text-headline font-semibold text-label-primary">
                {primaryDomain?.hostname ?? t("account:PROJECT_SEO_ANALYSIS_NOT_READY")}
              </div>
            </div>
            <div className="border-t border-border px-4 py-4 md:border-t-0">
              <div className="text-footnote text-label-secondary">
                {t("account:PROJECT_SEO_ANALYSIS_WARNINGS_LABEL")}
              </div>
              <div className="mt-1 text-title2 font-semibold text-label-primary">
                {warningCount}
              </div>
            </div>
          </section>

          <div>
            <div className="grid gap-3 border-b border-border px-4 pb-3 text-footnote font-medium text-label-secondary md:grid-cols-[1.25rem_minmax(12rem,0.7fr)_minmax(0,1fr)]">
              <span aria-hidden="true" />
              <span>{t("account:PROJECT_SEO_ANALYSIS_CHECK_LABEL")}</span>
              <span>{t("account:PROJECT_SEO_ANALYSIS_RESULT_LABEL")}</span>
            </div>
            <ul className="divide-y divide-border border-b border-border">
              {checks.map((check) => (
                <SeoAnalysisCheckRow key={check.key} check={check} />
              ))}
            </ul>
          </div>
        </div>
      </ContentGuard>
    </DefaultPage>
  );
}
