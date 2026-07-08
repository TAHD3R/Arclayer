import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  BookOpen,
  CheckCheck,
  Globe,
  type LucideIcon,
  LoaderCircle,
  Monitor,
  Palette,
  Plus,
  Rocket,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import {
  createProjectDomain,
  deleteProjectDomain,
  listProjectDomains,
  type ProjectDomainBinding,
  updateProjectDomain,
  verifyProjectDomain,
} from "@/api/project-settings";
import {
  buildProjectReleasesQueryKey,
  getProjectReleaseDryRun,
  listProjectReleases,
  publishProjectRelease,
} from "@/api/project-releases";
import { getProjectCoreSettings } from "@/api/settings";
import { AccessNoticeAlert } from "@/components/common/access-notice-alert";
import { BaseTag, lucideTagIcon } from "@/components/ui/tags";
import { useProjectPermissionAccess } from "@/hooks/use-workspace-permission-access";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import { buildGeneralSettingsInitialValues } from "@/lib/settings/general/adapters";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { toOpenableProjectDomainUrl } from "@/lib/projects/domain-routing";
import { cn } from "@arclayer/lib/utils";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { SettingPanel } from "@arclayer/ui/setting-panel";
import type { AdminRelease, AdminReleaseDryRun } from "@arclayer/openapi/admin-types";

const DOMAIN_QUERY_KEY_PREFIX = ["project", "domains"] as const;

function buildProjectDomainsQueryKey(projectId: string) {
  return [...DOMAIN_QUERY_KEY_PREFIX, projectId] as const;
}

function DomainSourceTag(props: { domain: ProjectDomainBinding }) {
  const { t } = useTranslation("account");
  return (
    <BaseTag color={props.domain.source === "platform" ? "blue" : "default"}>
      {props.domain.source === "platform"
        ? t("SETTINGS_PROJECT_DOMAINS_SOURCE_PLATFORM")
        : t("SETTINGS_PROJECT_DOMAINS_SOURCE_CUSTOM")}
    </BaseTag>
  );
}

function DomainRoutingTag(props: { domain: ProjectDomainBinding }) {
  const { t } = useTranslation("account");
  if (!props.domain.isVerified) {
    return (
      <BaseTag color="gold" icon={lucideTagIcon(ShieldAlert)}>
        {t("SETTINGS_PROJECT_DOMAINS_STATUS_PENDING")}
      </BaseTag>
    );
  }
  if (!props.domain.isActive) {
    return <BaseTag color="default">{t("SETTINGS_PROJECT_DOMAINS_STATUS_DISABLED")}</BaseTag>;
  }
  return (
    <BaseTag color="green" icon={lucideTagIcon(ShieldCheck)}>
      {t("SETTINGS_PROJECT_DOMAINS_STATUS_ACTIVE")}
    </BaseTag>
  );
}

function DomainCertificateTag(props: { domain: ProjectDomainBinding }) {
  const { t } = useTranslation("account");
  switch (props.domain.certificateStatus) {
    case "platform_managed":
      return (
        <BaseTag color="blue">{t("SETTINGS_PROJECT_DOMAINS_CERTIFICATE_PLATFORM_MANAGED")}</BaseTag>
      );
    case "issued":
      return <BaseTag color="green">{t("SETTINGS_PROJECT_DOMAINS_CERTIFICATE_ISSUED")}</BaseTag>;
    case "error":
      return <BaseTag color="error">{t("SETTINGS_PROJECT_DOMAINS_CERTIFICATE_ERROR")}</BaseTag>;
    case "pending":
    default:
      return <BaseTag color="gold">{t("SETTINGS_PROJECT_DOMAINS_CERTIFICATE_PENDING")}</BaseTag>;
  }
}

function DomainPrimaryTag(props: { domain: ProjectDomainBinding }) {
  const { t } = useTranslation("account");
  if (!props.domain.isPrimary) return null;
  return <BaseTag color="default">{t("SETTINGS_PROJECT_DOMAINS_PRIMARY")}</BaseTag>;
}

function DomainDnsInstruction(props: { domain: ProjectDomainBinding }) {
  const { t } = useTranslation("account");
  if (props.domain.source !== "custom" || props.domain.isVerified || !props.domain.dns) {
    return null;
  }

  return (
    <div
      className="grid gap-3 rounded-lg border border-amber-500/20 bg-amber-500/6 px-4 py-4"
      data-testid={`project-domain-dns-${props.domain.bindingId}`}
    >
      <div className="text-caption font-semibold text-label-primary">
        {t("SETTINGS_PROJECT_DOMAINS_DNS_TITLE")}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="grid gap-1.5">
          <span className="text-footnote text-label-secondary">
            {t("SETTINGS_PROJECT_DOMAINS_DNS_NAME")}
          </span>
          <code className="break-all rounded-md border border-border bg-background px-3 py-2 text-footnote text-label-primary">
            {props.domain.dns.txtRecordName}
          </code>
        </div>
        <div className="grid gap-1.5">
          <span className="text-footnote text-label-secondary">
            {t("SETTINGS_PROJECT_DOMAINS_DNS_VALUE")}
          </span>
          <code className="break-all rounded-md border border-border bg-background px-3 py-2 text-footnote text-label-primary">
            {props.domain.dns.txtRecordValue}
          </code>
        </div>
      </div>
    </div>
  );
}

function DomainMeta(props: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <span className="text-footnote text-label-secondary">{props.label}</span>
      <span className="text-callout text-label-primary">{props.value}</span>
    </div>
  );
}

function selectPreviewDomain(domains: ProjectDomainBinding[]): ProjectDomainBinding | null {
  return (
    domains.find((domain) => domain.isPrimary && domain.isVerified && domain.isActive) ??
    domains.find((domain) => domain.isVerified && domain.isActive) ??
    domains.find((domain) => domain.isActive) ??
    domains[0] ??
    null
  );
}

function selectActiveRelease(releases: AdminRelease[]): AdminRelease | null {
  return releases.find((release) => release.isActive) ?? null;
}

function formatReleaseTitle(release: AdminRelease | null, fallback: string): string {
  if (!release) return fallback;
  return `#${release.releaseNumber}`;
}

type WebsiteReadinessState = "ready" | "pending" | "blocked";

type WebsiteControlWorkflowLink = {
  description: string;
  href: string;
  icon: LucideIcon;
  id: string;
  label: string;
};

function buildWebsiteControlWorkflowLinks(
  projectId: string,
  t: (key: string) => string,
): WebsiteControlWorkflowLink[] {
  return [
    {
      description: t("WEBSITE_CONTROL_WORKFLOW_LINK_EDITOR_DESC"),
      href: `/projects/${projectId}/editor`,
      icon: Monitor,
      id: "editor",
      label: t("WEBSITE_CONTROL_WORKFLOW_LINK_EDITOR"),
    },
    {
      description: t("WEBSITE_CONTROL_WORKFLOW_LINK_CONTENT_DESC"),
      href: `/projects/${projectId}/content/library`,
      icon: BookOpen,
      id: "content-library",
      label: t("WEBSITE_CONTROL_WORKFLOW_LINK_CONTENT"),
    },
    {
      description: t("WEBSITE_CONTROL_WORKFLOW_LINK_CONFIG_DESC"),
      href: `/projects/${projectId}/website/config`,
      icon: Settings2,
      id: "website-config",
      label: t("WEBSITE_CONTROL_WORKFLOW_LINK_CONFIG"),
    },
    {
      description: t("WEBSITE_CONTROL_WORKFLOW_LINK_RELEASES_DESC"),
      href: `/projects/${projectId}/website/releases`,
      icon: Rocket,
      id: "releases",
      label: t("WEBSITE_CONTROL_WORKFLOW_LINK_RELEASES"),
    },
  ];
}

function WebsiteReadinessItem(props: {
  label: string;
  detail: string;
  state: WebsiteReadinessState;
}) {
  return (
    <div className="min-w-0 border-border px-0 py-1 sm:border-l sm:px-4 sm:first:border-l-0 sm:first:pl-0">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            "size-2 rounded-full",
            props.state === "ready" && "bg-green-500",
            props.state === "pending" && "bg-label-tertiary",
            props.state === "blocked" && "bg-amber-500",
          )}
        />
        <span className="truncate text-caption font-medium uppercase tracking-normal text-label-tertiary">
          {props.label}
        </span>
      </div>
      <div className="mt-1 truncate text-callout font-medium text-label-primary">
        {props.detail}
      </div>
    </div>
  );
}

function WebsiteReadinessStrip(props: {
  domainReady: boolean;
  brandReady: boolean;
  releaseReady: boolean;
  dryRun: AdminReleaseDryRun | null;
  dryRunPending: boolean;
}) {
  const { t } = useTranslation("account");
  const dryRunSummary = props.dryRun?.readinessSummary;
  const releaseCheckState: WebsiteReadinessState = props.dryRunPending
    ? "pending"
    : dryRunSummary
      ? dryRunSummary.ready
        ? "ready"
        : "blocked"
      : "pending";
  const releaseCheckDetail = props.dryRunPending
    ? t("WEBSITE_CONTROL_RELEASE_CHECKING")
    : dryRunSummary
      ? dryRunSummary.ready
        ? t("WEBSITE_CONTROL_RELEASE_READY")
        : t("WEBSITE_CONTROL_RELEASE_BLOCKED")
      : t("WEBSITE_CONTROL_RELEASE_CHECK_NOT_RUN");

  return (
    <div
      className="grid gap-4 rounded-lg border border-border bg-background px-4 py-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,2.4fr)]"
      data-testid="website-control-readiness-strip"
    >
      <div className="min-w-0">
        <h2 className="text-headline font-semibold text-label-primary">
          {t("WEBSITE_CONTROL_READINESS_TITLE")}
        </h2>
        <p className="mt-1 text-footnote text-label-secondary">
          {t("WEBSITE_CONTROL_READINESS_DESC")}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <WebsiteReadinessItem
          label={t("WEBSITE_CONTROL_DOMAIN_EYEBROW")}
          detail={
            props.domainReady
              ? t("WEBSITE_CONTROL_DOMAIN_ROUTE_READY")
              : t("WEBSITE_CONTROL_DOMAIN_ROUTE_PENDING")
          }
          state={props.domainReady ? "ready" : "pending"}
        />
        <WebsiteReadinessItem
          label={t("WEBSITE_CONTROL_BRAND_EYEBROW")}
          detail={
            props.brandReady
              ? t("WEBSITE_CONTROL_BRAND_ASSETS_READY")
              : t("WEBSITE_CONTROL_BRAND_ASSETS_MISSING")
          }
          state={props.brandReady ? "ready" : "pending"}
        />
        <WebsiteReadinessItem
          label={t("WEBSITE_CONTROL_RELEASE_EYEBROW")}
          detail={
            props.releaseReady
              ? t("WEBSITE_CONTROL_RELEASE_ACTIVE")
              : t("WEBSITE_CONTROL_RELEASE_MISSING")
          }
          state={props.releaseReady ? "ready" : "pending"}
        />
        <WebsiteReadinessItem
          label={t("WEBSITE_CONTROL_RELEASE_CHECK")}
          detail={releaseCheckDetail}
          state={releaseCheckState}
        />
      </div>
    </div>
  );
}

function WebsiteControlCard(props: {
  icon: LucideIcon;
  title: string;
  description: string;
  eyebrow: string;
  actionLabel: string;
  testId: string;
  onAction: () => void;
  children?: ReactNode;
}) {
  const Icon = props.icon;
  return (
    <div
      className="grid min-h-44 content-between gap-4 rounded-lg border border-border bg-card px-4 py-4"
      data-testid={props.testId}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-caption font-medium uppercase tracking-normal text-label-tertiary">
          <Icon size={14} />
          <span className="truncate">{props.eyebrow}</span>
        </div>
        <div className="mt-3 min-w-0">
          <div className="truncate text-headline font-semibold text-label-primary">
            {props.title}
          </div>
          <p className="mt-1 line-clamp-2 text-footnote text-label-secondary">
            {props.description}
          </p>
        </div>
        {props.children ? <div className="mt-3">{props.children}</div> : null}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="justify-self-start"
        onClick={props.onAction}
      >
        {props.actionLabel}
        <ArrowRight size={15} />
      </Button>
    </div>
  );
}

function WebsiteControlWorkflowPanel(props: { links: readonly WebsiteControlWorkflowLink[] }) {
  const { t } = useTranslation("account");
  return (
    <section
      aria-label={t("WEBSITE_CONTROL_WORKFLOW_LABEL")}
      className="grid gap-4 rounded-lg border border-border bg-background px-4 py-4"
      data-testid="website-control-workflow-panel"
    >
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-caption font-medium uppercase tracking-normal text-label-tertiary">
            <Globe size={14} />
            {t("WEBSITE_CONTROL_WORKFLOW_EYEBROW")}
          </div>
          <h2 className="mt-2 text-headline font-semibold text-label-primary">
            {t("WEBSITE_CONTROL_WORKFLOW_TITLE")}
          </h2>
          <p className="mt-1 max-w-3xl text-footnote text-label-secondary">
            {t("WEBSITE_CONTROL_WORKFLOW_DESC")}
          </p>
        </div>
      </div>
      <nav
        aria-label={t("WEBSITE_CONTROL_WORKFLOW_LINKS_LABEL")}
        className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"
        data-testid="website-control-workflow-links"
      >
        {props.links.map((link) => {
          const Icon = link.icon;
          return (
            <a
              key={link.id}
              href={link.href}
              className="flex min-w-0 items-start gap-2 rounded-md border border-border bg-card px-3 py-3 text-left transition-colors hover:bg-muted"
            >
              <Icon className="mt-0.5 size-4 shrink-0 text-label-secondary" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block truncate text-footnote font-medium text-label-primary">
                  {link.label}
                </span>
                <span className="mt-1 line-clamp-2 block text-caption1 text-label-secondary">
                  {link.description}
                </span>
              </span>
            </a>
          );
        })}
      </nav>
    </section>
  );
}

type WebsiteBrandReadiness = {
  hasFavicon: boolean;
  hasLogo: boolean;
  hasSiteName: boolean;
  ready: boolean;
};

function resolveBrandReadiness(config: ReturnType<typeof buildGeneralSettingsInitialValues>) {
  const hasSiteName = Boolean(config.siteName.trim());
  const hasLogo = Boolean(config.siteLogoUrl || config.siteLogoAssetId);
  const hasFavicon = Boolean(config.siteFaviconUrl || config.siteFaviconAssetId);
  return {
    hasFavicon,
    hasLogo,
    hasSiteName,
    ready: hasSiteName && hasLogo && hasFavicon,
  };
}

function BrandRequirementTag(props: { label: string; ready: boolean }) {
  return <BaseTag color={props.ready ? "green" : "default"}>{props.label}</BaseTag>;
}

function WebsiteBrandChecklist(props: { readiness: WebsiteBrandReadiness }) {
  const { t } = useTranslation("account");
  return (
    <div className="flex flex-wrap gap-2" data-testid="website-control-brand-checklist">
      <BrandRequirementTag
        label={t("WEBSITE_CONTROL_BRAND_SITE_NAME")}
        ready={props.readiness.hasSiteName}
      />
      <BrandRequirementTag
        label={t("WEBSITE_CONTROL_BRAND_LOGO")}
        ready={props.readiness.hasLogo}
      />
      <BrandRequirementTag
        label={t("WEBSITE_CONTROL_BRAND_FAVICON")}
        ready={props.readiness.hasFavicon}
      />
    </div>
  );
}

function ReleaseReadinessSummary(props: { dryRun: AdminReleaseDryRun | null; pending: boolean }) {
  const { t } = useTranslation("account");
  if (props.pending) {
    return (
      <div className="flex items-center gap-2 text-caption1 text-label-secondary">
        <LoaderCircle className="animate-spin" size={14} />
        {t("WEBSITE_CONTROL_RELEASE_CHECKING")}
      </div>
    );
  }

  const summary = props.dryRun?.readinessSummary;
  if (!summary) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <BaseTag color={summary.ready ? "green" : "gold"}>
        {summary.ready ? t("WEBSITE_CONTROL_RELEASE_READY") : t("WEBSITE_CONTROL_RELEASE_BLOCKED")}
      </BaseTag>
      <BaseTag color="default">
        {t("WEBSITE_CONTROL_RELEASE_SELECTED_COUNT", {
          count: summary.selectedItemCount ?? 0,
        })}
      </BaseTag>
      {(summary.blockedItemCount ?? 0) > 0 ? (
        <BaseTag color="gold">
          {t("WEBSITE_CONTROL_RELEASE_BLOCKED_COUNT", {
            count: summary.blockedItemCount ?? 0,
          })}
        </BaseTag>
      ) : null}
    </div>
  );
}

function DomainBindingRow(props: {
  domain: ProjectDomainBinding;
  pending: boolean;
  canManageDomains: boolean;
  onDelete: (bindingId: string) => void;
  onToggle: (domain: ProjectDomainBinding) => void;
  onVerify: (bindingId: string) => void;
}) {
  const { t } = useTranslation("account");
  const runtimeLabel = props.domain.runtimeName || t("SETTINGS_PROJECT_DOMAINS_RUNTIME_PRIMARY");
  const environmentLabel =
    props.domain.environmentId || t("SETTINGS_PROJECT_DOMAINS_ENVIRONMENT_DEFAULT");
  const canDelete = props.domain.source === "custom" && props.canManageDomains;
  const verifyVisible =
    props.domain.source === "custom" && !props.domain.isVerified && props.canManageDomains;
  const toggleLabel = props.domain.isActive
    ? t("SETTINGS_PROJECT_DOMAINS_DISABLE")
    : t("SETTINGS_PROJECT_DOMAINS_ENABLE");

  return (
    <div
      className="grid gap-4 px-4 py-4"
      data-testid={`project-domain-row-${props.domain.bindingId}`}
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-headline font-semibold text-label-primary">
              {props.domain.hostname}
            </span>
            <DomainSourceTag domain={props.domain} />
            <DomainPrimaryTag domain={props.domain} />
            <DomainRoutingTag domain={props.domain} />
            <DomainCertificateTag domain={props.domain} />
          </div>
          <div className="grid gap-3 text-left sm:grid-cols-3">
            <DomainMeta label={t("SETTINGS_PROJECT_DOMAINS_RUNTIME_LABEL")} value={runtimeLabel} />
            <DomainMeta
              label={t("SETTINGS_PROJECT_DOMAINS_ENVIRONMENT_LABEL")}
              value={environmentLabel}
            />
            <DomainMeta
              label={t("SETTINGS_PROJECT_DOMAINS_BINDING_ID_LABEL")}
              value={props.domain.bindingId}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {verifyVisible ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={props.pending}
              onClick={() => props.onVerify(props.domain.bindingId)}
              data-testid={`project-domain-verify-${props.domain.bindingId}`}
            >
              <CheckCheck size={16} />
              {t("SETTINGS_PROJECT_DOMAINS_VERIFY")}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={props.pending || !props.canManageDomains}
            onClick={() => props.onToggle(props.domain)}
            data-testid={`project-domain-toggle-${props.domain.bindingId}`}
          >
            {props.pending ? <LoaderCircle className="animate-spin" size={16} /> : null}
            {toggleLabel}
          </Button>
          {canDelete ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={props.pending}
              aria-label={t("SETTINGS_PROJECT_DOMAINS_DELETE")}
              onClick={() => props.onDelete(props.domain.bindingId)}
              data-testid={`project-domain-delete-${props.domain.bindingId}`}
            >
              <Trash2 size={16} />
            </Button>
          ) : null}
        </div>
      </div>

      <DomainDnsInstruction domain={props.domain} />
    </div>
  );
}

export function ProjectDomainSettingsPage(props: { projectId: string; embedded?: boolean }) {
  const { t } = useTranslation(["account", "common"]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const permissionAccess = useProjectPermissionAccess(props.projectId);
  const [hostname, setHostname] = useState("");
  const queryKey = buildProjectDomainsQueryKey(props.projectId);

  const domainsQuery = useQuery({
    queryKey,
    enabled: Boolean(props.projectId),
    queryFn: async () => listProjectDomains(props.projectId),
  });
  const projectCoreQuery = useQuery({
    queryKey: ["settings", "project", "core", props.projectId],
    enabled: Boolean(props.projectId),
    queryFn: async () => getProjectCoreSettings(props.projectId),
    staleTime: 5 * 60 * 1000,
    meta: { silent: true },
  });
  const releasesQuery = useQuery({
    queryKey: buildProjectReleasesQueryKey(props.projectId),
    enabled: Boolean(props.projectId),
    queryFn: async () => listProjectReleases(props.projectId),
    meta: { silent: true },
  });

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      queryClient.invalidateQueries({
        queryKey: ["project", "source", props.projectId],
      }),
    ]);
  };

  const invalidateReleaseState = async () => {
    await queryClient.invalidateQueries({
      queryKey: buildProjectReleasesQueryKey(props.projectId),
    });
  };

  const createMutation = useMutation({
    mutationFn: async () => createProjectDomain(props.projectId, hostname.trim()),
    onSuccess: async () => {
      setHostname("");
      notifySuccessText(t("account:SETTINGS_PROJECT_DOMAINS_CREATED"));
      await invalidate();
    },
    onError: (error) => notifyError(error),
  });

  const verifyMutation = useMutation({
    mutationFn: async (bindingId: string) => verifyProjectDomain(props.projectId, bindingId),
    onSuccess: async () => {
      notifySuccessText(t("account:SETTINGS_PROJECT_DOMAINS_VERIFIED"));
      await invalidate();
    },
    onError: (error) => notifyError(error),
  });

  const updateMutation = useMutation({
    mutationFn: async (domain: ProjectDomainBinding) =>
      updateProjectDomain(props.projectId, domain.bindingId, { isActive: !domain.isActive }),
    onSuccess: async () => {
      notifySuccessText(t("common:SETTINGS_SAVED"));
      await invalidate();
    },
    onError: (error) => notifyError(error),
  });

  const deleteMutation = useMutation({
    mutationFn: async (bindingId: string) => deleteProjectDomain(props.projectId, bindingId),
    onSuccess: async () => {
      notifySuccessText(t("account:SETTINGS_PROJECT_DOMAINS_DELETED"));
      await invalidate();
    },
    onError: (error) => notifyError(error),
  });

  const releaseDryRunMutation = useMutation({
    mutationFn: async () => getProjectReleaseDryRun(props.projectId),
    onSuccess: () => {
      notifySuccessText(t("account:WEBSITE_CONTROL_RELEASE_CHECKED"));
    },
    onError: (error) => notifyError(error),
  });

  const publishReleaseMutation = useMutation({
    mutationFn: async () => publishProjectRelease(props.projectId),
    onSuccess: async (result) => {
      notifySuccessText(
        t("account:WEBSITE_CONTROL_RELEASE_PUBLISHED", {
          count: result.release.releaseNumber,
        }),
      );
      releaseDryRunMutation.reset();
      await invalidateReleaseState();
    },
    onError: (error) => notifyError(error),
  });

  const pending =
    createMutation.isPending ||
    verifyMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending;
  const domains = domainsQuery.data ?? [];
  const previewDomain = useMemo(() => selectPreviewDomain(domains), [domains]);
  const previewDomainUrl = toOpenableProjectDomainUrl(previewDomain?.hostname);
  const activeRelease = useMemo(
    () => selectActiveRelease(releasesQuery.data ?? []),
    [releasesQuery.data],
  );
  const websiteConfig = useMemo(
    () => buildGeneralSettingsInitialValues({ project: projectCoreQuery.data }),
    [projectCoreQuery.data],
  );
  const brandReadiness = useMemo(() => resolveBrandReadiness(websiteConfig), [websiteConfig]);
  const workflowLinks = useMemo(
    () => buildWebsiteControlWorkflowLinks(props.projectId, t),
    [props.projectId, t],
  );
  const permissionReady = permissionAccess.authzQuery.isFetched;
  const canManageDomains =
    Boolean(props.projectId) &&
    permissionReady &&
    permissionAccess.hasAction("project:domains:manage");
  const canPublishRelease =
    Boolean(props.projectId) &&
    permissionReady &&
    permissionAccess.hasAction("project:release:publish");

  const platformCount = useMemo(
    () => domains.filter((domain) => domain.source === "platform").length,
    [domains],
  );

  const content = (
    <ContentGuard
      loading={
        domainsQuery.isLoading ||
        (projectCoreQuery.isLoading && !projectCoreQuery.data) ||
        (releasesQuery.isLoading && !releasesQuery.data)
      }
      loadingVariant="form"
      error={domainsQuery.error ?? projectCoreQuery.error ?? releasesQuery.error}
      onRetry={
        domainsQuery.isError || projectCoreQuery.isError || releasesQuery.isError
          ? () => {
              void domainsQuery.refetch();
              void projectCoreQuery.refetch();
              void releasesQuery.refetch();
            }
          : undefined
      }
    >
      <div className="grid gap-8">
        {permissionReady && !canManageDomains ? (
          <AccessNoticeAlert
            className="mb-0"
            data-testid="project-domains-read-only-notice"
            description={t("account:SETTINGS_PROJECT_READ_ONLY_DESC")}
          />
        ) : null}

        <section className="grid gap-4" aria-label={t("account:WEBSITE_CONTROL_TITLE")}>
          <WebsiteReadinessStrip
            domainReady={Boolean(
              previewDomain?.isVerified && previewDomain.isActive && previewDomainUrl,
            )}
            brandReady={brandReadiness.ready}
            releaseReady={Boolean(activeRelease?.isActive)}
            dryRun={releaseDryRunMutation.data ?? null}
            dryRunPending={releaseDryRunMutation.isPending}
          />
          <WebsiteControlWorkflowPanel links={workflowLinks} />
          <div className="grid gap-4 xl:grid-cols-3">
            <WebsiteControlCard
              icon={Globe}
              testId="website-control-domain-card"
              eyebrow={t("account:WEBSITE_CONTROL_DOMAIN_EYEBROW")}
              title={previewDomain?.hostname ?? t("account:WEBSITE_CONTROL_DOMAIN_EMPTY_TITLE")}
              description={
                previewDomain
                  ? t("account:WEBSITE_CONTROL_DOMAIN_DESC")
                  : t("account:WEBSITE_CONTROL_DOMAIN_EMPTY_DESC")
              }
              actionLabel={
                previewDomain?.isVerified && previewDomain.isActive && previewDomainUrl
                  ? t("account:WEBSITE_CONTROL_OPEN_SITE")
                  : t("account:WEBSITE_CONTROL_MANAGE_DOMAINS")
              }
              onAction={() => {
                if (previewDomain?.isVerified && previewDomain.isActive && previewDomainUrl) {
                  window.open(previewDomainUrl, "_blank", "noopener,noreferrer");
                  return;
                }
                document.getElementById("project-domain-create-input")?.focus();
              }}
            >
              <div className="flex flex-wrap gap-2">
                {previewDomain ? <DomainRoutingTag domain={previewDomain} /> : null}
                {previewDomain ? <DomainCertificateTag domain={previewDomain} /> : null}
              </div>
            </WebsiteControlCard>

            <WebsiteControlCard
              icon={Palette}
              testId="website-control-brand-card"
              eyebrow={t("account:WEBSITE_CONTROL_BRAND_EYEBROW")}
              title={websiteConfig.siteName || t("account:WEBSITE_CONTROL_BRAND_EMPTY_TITLE")}
              description={
                brandReadiness.ready
                  ? t("account:WEBSITE_CONTROL_BRAND_READY_DESC")
                  : t("account:WEBSITE_CONTROL_BRAND_EMPTY_DESC")
              }
              actionLabel={t("account:WEBSITE_CONTROL_OPEN_WEBSITE_CONFIG")}
              onAction={() =>
                void navigate({
                  to: "/projects/$projectId/website/config",
                  params: { projectId: props.projectId },
                })
              }
            >
              <div className="flex items-center gap-2 text-caption1 text-label-secondary">
                <span className="size-2 rounded-full bg-label-tertiary" />
                {brandReadiness.ready
                  ? t("account:WEBSITE_CONTROL_BRAND_ASSETS_READY")
                  : t("account:WEBSITE_CONTROL_BRAND_ASSETS_MISSING")}
              </div>
              <div className="mt-2">
                <WebsiteBrandChecklist readiness={brandReadiness} />
              </div>
            </WebsiteControlCard>

            <WebsiteControlCard
              icon={Rocket}
              testId="website-control-release-card"
              eyebrow={t("account:WEBSITE_CONTROL_RELEASE_EYEBROW")}
              title={formatReleaseTitle(
                activeRelease,
                t("account:WEBSITE_CONTROL_RELEASE_EMPTY_TITLE"),
              )}
              description={
                activeRelease
                  ? t("account:WEBSITE_CONTROL_RELEASE_ACTIVE_DESC")
                  : t("account:WEBSITE_CONTROL_RELEASE_EMPTY_DESC")
              }
              actionLabel={t("account:WEBSITE_CONTROL_OPEN_RELEASES")}
              onAction={() =>
                void navigate({
                  to: "/projects/$projectId/website/releases",
                  params: { projectId: props.projectId },
                })
              }
            >
              <div className="grid gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {activeRelease ? (
                    <>
                      <BaseTag color={activeRelease.isActive ? "green" : "default"}>
                        {activeRelease.status}
                      </BaseTag>
                      <BaseTag color="default">
                        {t("account:WEBSITE_CONTROL_RELEASE_SELECTION_COUNT", {
                          count: activeRelease.selectionCount,
                        })}
                      </BaseTag>
                    </>
                  ) : (
                    <BaseTag color="gold">{t("account:WEBSITE_CONTROL_RELEASE_PENDING")}</BaseTag>
                  )}
                </div>
                <ReleaseReadinessSummary
                  dryRun={releaseDryRunMutation.data ?? null}
                  pending={releaseDryRunMutation.isPending}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    loading={releaseDryRunMutation.isPending}
                    disabled={!canPublishRelease || publishReleaseMutation.isPending}
                    onClick={() => void releaseDryRunMutation.mutateAsync()}
                    data-testid="website-control-release-check"
                  >
                    {t("account:WEBSITE_CONTROL_RELEASE_CHECK")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    loading={publishReleaseMutation.isPending}
                    disabled={
                      !canPublishRelease ||
                      releaseDryRunMutation.isPending ||
                      publishReleaseMutation.isPending
                    }
                    title={
                      permissionReady && !canPublishRelease
                        ? t("account:WEBSITE_CONTROL_RELEASE_NO_ACCESS")
                        : undefined
                    }
                    onClick={() => void publishReleaseMutation.mutateAsync()}
                    data-testid="website-control-release-publish"
                  >
                    <Rocket size={15} />
                    {t("account:WEBSITE_CONTROL_RELEASE_PUBLISH")}
                  </Button>
                </div>
              </div>
            </WebsiteControlCard>
          </div>
        </section>

        <SettingPanel
          title={t("account:SETTINGS_PROJECT_DOMAINS_ADD_TITLE")}
          description={t("account:SETTINGS_PROJECT_DOMAINS_ADD_DESC")}
          bordered={false}
        >
          <form
            className="grid gap-4 rounded-lg border border-border bg-card px-4 py-4 lg:grid-cols-[minmax(0,1fr)_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              if (!hostname.trim() || !canManageDomains) return;
              void createMutation.mutateAsync();
            }}
          >
            <Input
              id="project-domain-create-input"
              value={hostname}
              onChange={(event) => setHostname(event.target.value)}
              placeholder={t("account:SETTINGS_PROJECT_DOMAINS_PLACEHOLDER")}
              autoComplete="off"
              disabled={!canManageDomains}
              data-testid="project-domain-create-input"
            />
            <Button
              type="submit"
              loading={createMutation.isPending}
              disabled={!hostname.trim() || !canManageDomains}
              data-testid="project-domain-create-submit"
            >
              <Plus size={16} />
              {t("account:SETTINGS_PROJECT_DOMAINS_ADD")}
            </Button>
          </form>
        </SettingPanel>

        <SettingPanel
          title={t("account:SETTINGS_PROJECT_DOMAINS_BINDINGS_TITLE")}
          description={t("account:SETTINGS_PROJECT_DOMAINS_BINDINGS_DESC", {
            count: platformCount,
          })}
          bordered={false}
        >
          {domains.length > 0 ? (
            <div
              className="overflow-hidden rounded-lg border border-border bg-card divide-y divide-border"
              data-testid="project-domain-settings-list"
            >
              {domains.map((domain) => (
                <DomainBindingRow
                  key={domain.bindingId}
                  domain={domain}
                  pending={pending}
                  canManageDomains={canManageDomains}
                  onDelete={(bindingId) => void deleteMutation.mutateAsync(bindingId)}
                  onToggle={(nextDomain) => void updateMutation.mutateAsync(nextDomain)}
                  onVerify={(bindingId) => void verifyMutation.mutateAsync(bindingId)}
                />
              ))}
            </div>
          ) : (
            <div
              className={cn(
                "grid gap-2 rounded-lg border border-dashed border-border bg-card px-5 py-8",
                "text-callout text-label-secondary",
              )}
              data-testid="project-domain-empty-state"
            >
              <div className="flex items-center gap-2 text-headline text-label-primary">
                <Globe size={16} />
                {t("account:SETTINGS_PROJECT_DOMAINS_EMPTY_TITLE")}
              </div>
              <p>{t("account:SETTINGS_PROJECT_DOMAINS_EMPTY")}</p>
            </div>
          )}
        </SettingPanel>
      </div>
    </ContentGuard>
  );

  if (props.embedded) {
    return content;
  }

  return (
    <DefaultPage
      title={t("account:SETTINGS_NAV_PROJECT_DOMAIN")}
      description={t("account:SETTINGS_PROJECT_DOMAINS_DESC")}
      showFavoriteToggle={false}
      contentContainerClassName="min-h-full"
    >
      {content}
    </DefaultPage>
  );
}
