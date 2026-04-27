import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCheck,
  Globe,
  LoaderCircle,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  createProjectDomain,
  deleteProjectDomain,
  listProjectDomains,
  type ProjectDomainBinding,
  updateProjectDomain,
  verifyProjectDomain,
} from "@/api/project-settings";
import { AccessNoticeAlert } from "@/components/common/access-notice-alert";
import { BaseTag, lucideTagIcon } from "@/components/ui/tags";
import { useProjectPermissionAccess } from "@/hooks/use-workspace-permission-access";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { cn } from "@arclayer/lib/utils";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { SettingPanel } from "@arclayer/ui/setting-panel";

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
  const queryClient = useQueryClient();
  const permissionAccess = useProjectPermissionAccess(props.projectId);
  const [hostname, setHostname] = useState("");
  const queryKey = buildProjectDomainsQueryKey(props.projectId);

  const domainsQuery = useQuery({
    queryKey,
    enabled: Boolean(props.projectId),
    queryFn: async () => listProjectDomains(props.projectId),
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey });
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

  const pending =
    createMutation.isPending ||
    verifyMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending;
  const domains = domainsQuery.data ?? [];
  const permissionReady = permissionAccess.authzQuery.isFetched;
  const canManageDomains =
    Boolean(props.projectId) &&
    permissionReady &&
    permissionAccess.hasAction("project:domains:manage");

  const platformCount = useMemo(
    () => domains.filter((domain) => domain.source === "platform").length,
    [domains],
  );

  const content = (
    <ContentGuard
      loading={domainsQuery.isLoading}
      loadingVariant="form"
      error={domainsQuery.error}
      onRetry={domainsQuery.isError ? () => void domainsQuery.refetch() : undefined}
    >
      <div className="grid gap-8">
        {permissionReady && !canManageDomains ? (
          <AccessNoticeAlert
            className="mb-0"
            data-testid="project-domains-read-only-notice"
            description={t("account:SETTINGS_PROJECT_READ_ONLY_DESC")}
          />
        ) : null}

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
      pageFrame="full"
      className="min-h-full"
      contentClassName="min-h-full"
      contentContainerClassName="min-h-full"
    >
      {content}
    </DefaultPage>
  );
}
