import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCheck, ExternalLink, Globe2, LoaderCircle, ShieldCheck, Trash2 } from "lucide-react";
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
import { toOpenableProjectDomainUrl } from "@/lib/projects/domain-routing";
import { Button } from "@arclayer/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@arclayer/ui/empty";
import { Input } from "@arclayer/ui/input";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { SettingDialogField, SettingDialogFields } from "@arclayer/ui/setting-dialog-field";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@arclayer/ui/table";

const DOMAIN_QUERY_KEY_PREFIX = ["project", "domains"] as const;

function buildProjectDomainsQueryKey(projectId: string) {
  return [...DOMAIN_QUERY_KEY_PREFIX, projectId] as const;
}

function DomainSourceTag({ domain }: { domain: ProjectDomainBinding }) {
  const { t } = useTranslation("account");
  return (
    <BaseTag color={domain.source === "platform" ? "blue" : "default"}>
      {domain.source === "platform"
        ? t("SETTINGS_PROJECT_DOMAINS_SOURCE_PLATFORM")
        : t("SETTINGS_PROJECT_DOMAINS_SOURCE_CUSTOM")}
    </BaseTag>
  );
}

function DomainRoutingTag({ domain }: { domain: ProjectDomainBinding }) {
  const { t } = useTranslation("account");
  if (!domain.isVerified) {
    return <BaseTag color="gold">{t("SETTINGS_PROJECT_DOMAINS_STATUS_PENDING")}</BaseTag>;
  }
  if (!domain.isActive) {
    return <BaseTag color="default">{t("SETTINGS_PROJECT_DOMAINS_STATUS_DISABLED")}</BaseTag>;
  }
  return (
    <BaseTag color="green" icon={lucideTagIcon(ShieldCheck)}>
      {t("SETTINGS_PROJECT_DOMAINS_STATUS_ACTIVE")}
    </BaseTag>
  );
}

function DomainCertificateTag({ domain }: { domain: ProjectDomainBinding }) {
  const { t } = useTranslation("account");
  const labels: Record<string, string> = {
    error: t("SETTINGS_PROJECT_DOMAINS_CERTIFICATE_ERROR"),
    issued: t("SETTINGS_PROJECT_DOMAINS_CERTIFICATE_ISSUED"),
    pending: t("SETTINGS_PROJECT_DOMAINS_CERTIFICATE_PENDING"),
    platform_managed: t("SETTINGS_PROJECT_DOMAINS_CERTIFICATE_PLATFORM_MANAGED"),
  };
  const color =
    domain.certificateStatus === "issued" || domain.certificateStatus === "platform_managed"
      ? "green"
      : domain.certificateStatus === "error"
        ? "error"
        : "gold";
  return <BaseTag color={color}>{labels[domain.certificateStatus] ?? labels.pending}</BaseTag>;
}

function selectPrimaryDomain(domains: readonly ProjectDomainBinding[]) {
  return (
    domains.find((domain) => domain.isPrimary && domain.isVerified && domain.isActive) ??
    domains.find((domain) => domain.isVerified && domain.isActive) ??
    null
  );
}

function DomainSummary({ domains }: { domains: readonly ProjectDomainBinding[] }) {
  const { t } = useTranslation("account");
  const primaryDomain = selectPrimaryDomain(domains);
  const domainUrl = toOpenableProjectDomainUrl(primaryDomain?.hostname);

  return (
    <section
      className="flex flex-col gap-4 border-y border-border py-5 sm:flex-row sm:items-center sm:justify-between"
      aria-label={t("SETTINGS_PROJECT_DOMAINS_PRIMARY")}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-label-secondary">
          <Globe2 aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <div className="text-footnote text-label-secondary">
            {t("SETTINGS_PROJECT_DOMAINS_PRIMARY")}
          </div>
          <div className="truncate text-headline font-semibold text-label-primary">
            {primaryDomain?.hostname ?? t("SETTINGS_PROJECT_DOMAINS_NO_PRIMARY")}
          </div>
        </div>
      </div>
      {domainUrl ? (
        <Button type="button" variant="outline" size="sm" asChild>
          <a href={domainUrl} target="_blank" rel="noreferrer">
            {t("SETTINGS_PROJECT_DOMAINS_OPEN")}
            <ExternalLink aria-hidden="true" />
          </a>
        </Button>
      ) : null}
    </section>
  );
}

function DnsVerificationRow({ domain }: { domain: ProjectDomainBinding }) {
  const { t } = useTranslation("account");
  if (domain.source !== "custom" || domain.isVerified || !domain.dns) return null;

  return (
    <TableRow
      data-testid={`project-domain-dns-${domain.bindingId}`}
      className="hover:bg-transparent"
    >
      <TableCell colSpan={5} className="bg-muted/40 px-4 py-4">
        <div className="grid gap-3 lg:grid-cols-[12rem_minmax(0,1fr)_minmax(0,1fr)] lg:items-center">
          <div>
            <div className="text-caption font-semibold text-label-primary">
              {t("SETTINGS_PROJECT_DOMAINS_DNS_TITLE")}
            </div>
            <div className="text-footnote text-label-secondary">
              {t("SETTINGS_PROJECT_DOMAINS_DNS_DESC")}
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-footnote text-label-secondary">
              {t("SETTINGS_PROJECT_DOMAINS_DNS_NAME")}
            </div>
            <code className="mt-1 block truncate font-mono text-footnote text-label-primary">
              {domain.dns.txtRecordName}
            </code>
          </div>
          <div className="min-w-0">
            <div className="text-footnote text-label-secondary">
              {t("SETTINGS_PROJECT_DOMAINS_DNS_VALUE")}
            </div>
            <code className="mt-1 block truncate font-mono text-footnote text-label-primary">
              {domain.dns.txtRecordValue}
            </code>
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}

type DomainTableProps = {
  canManage: boolean;
  domains: readonly ProjectDomainBinding[];
  pending: boolean;
  onDelete: (domain: ProjectDomainBinding) => void;
  onToggle: (domain: ProjectDomainBinding) => void;
  onVerify: (bindingId: string) => void;
};

function DomainTable(props: DomainTableProps) {
  const { t } = useTranslation("account");
  if (props.domains.length === 0) {
    return (
      <Empty data-testid="project-domain-empty-state">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Globe2 />
          </EmptyMedia>
          <EmptyTitle>{t("SETTINGS_PROJECT_DOMAINS_EMPTY_TITLE")}</EmptyTitle>
          <EmptyDescription>{t("SETTINGS_PROJECT_DOMAINS_EMPTY")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div
      className="overflow-hidden rounded-lg border border-border"
      data-testid="project-domain-settings-list"
    >
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="px-4">{t("SETTINGS_PROJECT_DOMAINS_DOMAIN")}</TableHead>
            <TableHead>{t("SETTINGS_PROJECT_DOMAINS_ROUTING")}</TableHead>
            <TableHead>{t("SETTINGS_PROJECT_DOMAINS_TLS")}</TableHead>
            <TableHead>{t("SETTINGS_PROJECT_DOMAINS_TARGET")}</TableHead>
            <TableHead className="px-4 text-right">
              {t("SETTINGS_PROJECT_DOMAINS_ACTIONS")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {props.domains.map((domain) => (
            <DomainRows key={domain.bindingId} domain={domain} {...props} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function DomainRows(props: DomainTableProps & { domain: ProjectDomainBinding }) {
  const { t } = useTranslation("account");
  const { domain } = props;
  const canDelete = domain.source === "custom" && props.canManage;
  const canVerify = domain.source === "custom" && !domain.isVerified && props.canManage;

  return (
    <>
      <TableRow data-testid={`project-domain-row-${domain.bindingId}`}>
        <TableCell className="px-4 py-4">
          <div className="flex min-w-0 items-center gap-2">
            <span className="max-w-72 truncate font-medium text-label-primary">
              {domain.hostname}
            </span>
            <DomainSourceTag domain={domain} />
            {domain.isPrimary ? (
              <BaseTag color="default">{t("SETTINGS_PROJECT_DOMAINS_PRIMARY")}</BaseTag>
            ) : null}
          </div>
        </TableCell>
        <TableCell>
          <DomainRoutingTag domain={domain} />
        </TableCell>
        <TableCell>
          <DomainCertificateTag domain={domain} />
        </TableCell>
        <TableCell>
          <div className="text-footnote text-label-primary">
            {domain.runtimeName || t("SETTINGS_PROJECT_DOMAINS_RUNTIME_PRIMARY")}
          </div>
          <div className="text-footnote text-label-secondary">
            {domain.environmentId || t("SETTINGS_PROJECT_DOMAINS_ENVIRONMENT_DEFAULT")}
          </div>
        </TableCell>
        <TableCell className="px-4">
          <div className="flex items-center justify-end gap-2">
            {canVerify ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={props.pending}
                onClick={() => props.onVerify(domain.bindingId)}
                data-testid={`project-domain-verify-${domain.bindingId}`}
              >
                <CheckCheck aria-hidden="true" />
                {t("SETTINGS_PROJECT_DOMAINS_VERIFY")}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={props.pending || !props.canManage}
              onClick={() => props.onToggle(domain)}
              data-testid={`project-domain-toggle-${domain.bindingId}`}
            >
              {props.pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
              {domain.isActive
                ? t("SETTINGS_PROJECT_DOMAINS_DISABLE")
                : t("SETTINGS_PROJECT_DOMAINS_ENABLE")}
            </Button>
            {canDelete ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={props.pending}
                aria-label={t("SETTINGS_PROJECT_DOMAINS_DELETE")}
                onClick={() => props.onDelete(domain)}
                data-testid={`project-domain-delete-${domain.bindingId}`}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        </TableCell>
      </TableRow>
      <DnsVerificationRow domain={domain} />
    </>
  );
}

export function ProjectDomainSettingsPage(props: { projectId: string; embedded?: boolean }) {
  const { t } = useTranslation(["account", "common"]);
  const queryClient = useQueryClient();
  const permissionAccess = useProjectPermissionAccess(props.projectId);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [hostname, setHostname] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ProjectDomainBinding | null>(null);
  const queryKey = buildProjectDomainsQueryKey(props.projectId);

  const domainsQuery = useQuery({
    queryKey,
    enabled: Boolean(props.projectId),
    queryFn: () => listProjectDomains(props.projectId),
  });

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      queryClient.invalidateQueries({ queryKey: ["project", "source", props.projectId] }),
    ]);
  };

  const createMutation = useMutation({
    mutationFn: () => createProjectDomain(props.projectId, hostname.trim()),
    onSuccess: async () => {
      setHostname("");
      setAddDialogOpen(false);
      notifySuccessText(t("account:SETTINGS_PROJECT_DOMAINS_CREATED"));
      await invalidate();
    },
    onError: notifyError,
  });
  const verifyMutation = useMutation({
    mutationFn: (bindingId: string) => verifyProjectDomain(props.projectId, bindingId),
    onSuccess: async () => {
      notifySuccessText(t("account:SETTINGS_PROJECT_DOMAINS_VERIFIED"));
      await invalidate();
    },
    onError: notifyError,
  });
  const updateMutation = useMutation({
    mutationFn: (domain: ProjectDomainBinding) =>
      updateProjectDomain(props.projectId, domain.bindingId, { isActive: !domain.isActive }),
    onSuccess: async () => {
      notifySuccessText(t("common:SETTINGS_SAVED"));
      await invalidate();
    },
    onError: notifyError,
  });
  const deleteMutation = useMutation({
    mutationFn: (bindingId: string) => deleteProjectDomain(props.projectId, bindingId),
    onSuccess: async () => {
      setDeleteTarget(null);
      notifySuccessText(t("account:SETTINGS_PROJECT_DOMAINS_DELETED"));
      await invalidate();
    },
    onError: notifyError,
  });

  const permissionReady = permissionAccess.authzQuery.isFetched;
  const canManage = permissionReady && permissionAccess.hasAction("project:domains:manage");
  const domains = domainsQuery.data ?? [];
  const pending = verifyMutation.isPending || updateMutation.isPending || deleteMutation.isPending;
  const customDomainCount = useMemo(
    () => domains.filter((domain) => domain.source === "custom").length,
    [domains],
  );

  const content = (
    <ContentGuard
      loading={domainsQuery.isLoading}
      loadingVariant="table"
      error={domainsQuery.error}
      onRetry={domainsQuery.isError ? () => void domainsQuery.refetch() : undefined}
    >
      <div className="grid gap-6">
        {permissionReady && !canManage ? (
          <AccessNoticeAlert
            data-testid="project-domains-read-only-notice"
            description={t("account:SETTINGS_PROJECT_READ_ONLY_DESC")}
          />
        ) : null}
        <DomainSummary domains={domains} />
        <section className="grid gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-title3 font-semibold text-label-primary">
                {t("account:SETTINGS_PROJECT_DOMAINS_BINDINGS_TITLE")}
              </h2>
              <p className="mt-1 text-footnote text-label-secondary">
                {t("account:SETTINGS_PROJECT_DOMAINS_COUNT", {
                  count: domains.length,
                  custom: customDomainCount,
                })}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              disabled={!canManage}
              onClick={() => setAddDialogOpen(true)}
              data-testid="project-domain-add-trigger"
            >
              {t("account:SETTINGS_PROJECT_DOMAINS_ADD")}
            </Button>
          </div>
          <DomainTable
            canManage={canManage}
            domains={domains}
            pending={pending}
            onDelete={setDeleteTarget}
            onToggle={(domain) => void updateMutation.mutateAsync(domain)}
            onVerify={(bindingId) => void verifyMutation.mutateAsync(bindingId)}
          />
        </section>
      </div>
    </ContentGuard>
  );

  return (
    <>
      {props.embedded ? (
        content
      ) : (
        <DefaultPage
          title={t("account:SETTINGS_PROJECT_DOMAINS_TITLE")}
          description={t("account:SETTINGS_PROJECT_DOMAINS_DESC")}
          showFavoriteToggle={false}
          contentContainerClassName="min-h-full"
        >
          {content}
        </DefaultPage>
      )}

      <SettingDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        preventInitialFocus={false}
        title={t("account:SETTINGS_PROJECT_DOMAINS_ADD_TITLE")}
        description={t("account:SETTINGS_PROJECT_DOMAINS_ADD_DESC")}
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setAddDialogOpen(false)}>
              {t("common:CANCEL")}
            </Button>
            <Button
              type="button"
              loading={createMutation.isPending}
              disabled={!hostname.trim()}
              onClick={() => void createMutation.mutateAsync()}
              data-testid="project-domain-create-submit"
            >
              {t("account:SETTINGS_PROJECT_DOMAINS_ADD")}
            </Button>
          </div>
        }
      >
        <SettingDialogFields>
          <SettingDialogField title={t("account:SETTINGS_PROJECT_DOMAINS_DOMAIN")}>
            <Input
              id="project-domain-create-input"
              value={hostname}
              onChange={(event) => setHostname(event.target.value)}
              placeholder={t("account:SETTINGS_PROJECT_DOMAINS_PLACEHOLDER")}
              autoComplete="off"
              data-testid="project-domain-create-input"
            />
          </SettingDialogField>
        </SettingDialogFields>
      </SettingDialog>

      <SettingDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        preventInitialFocus={false}
        title={t("account:SETTINGS_PROJECT_DOMAINS_DELETE_DIALOG_TITLE")}
        description={t("account:SETTINGS_PROJECT_DOMAINS_DELETE_DIALOG_DESC")}
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setDeleteTarget(null)}>
              {t("common:CANCEL")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              loading={deleteMutation.isPending}
              disabled={!deleteTarget}
              onClick={() =>
                deleteTarget && void deleteMutation.mutateAsync(deleteTarget.bindingId)
              }
              data-testid="project-domain-delete-confirm"
            >
              {t("account:SETTINGS_PROJECT_DOMAINS_DELETE")}
            </Button>
          </div>
        }
      >
        <div className="rounded-md border border-border bg-muted/40 px-3 py-3 font-mono text-footnote text-label-primary">
          {deleteTarget?.hostname}
        </div>
      </SettingDialog>
    </>
  );
}
