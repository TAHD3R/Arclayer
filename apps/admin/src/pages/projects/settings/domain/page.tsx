import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCheck,
  CircleDot,
  ExternalLink,
  Globe2,
  LoaderCircle,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  createProjectDomain,
  deleteProjectDomain,
  listProjectDomains,
  projectDomainsQueryKey,
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
import {
  selectResolvedProjectDomain,
  toOpenableProjectDomainUrl,
} from "@/lib/projects/domain-routing";
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
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { SettingDialogField, SettingDialogFields } from "@arclayer/ui/setting-dialog-field";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@arclayer/ui/table";

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

function DomainSummary({ domains }: { domains: readonly ProjectDomainBinding[] }) {
  const { t } = useTranslation("account");
  const primaryDomain = selectResolvedProjectDomain(domains);
  const domainUrl = toOpenableProjectDomainUrl(primaryDomain?.hostname);

  return (
    <section
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between"
      aria-label={t("SETTINGS_PROJECT_DOMAINS_PRIMARY")}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-label-secondary">
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

function DnsVerificationRow(props: {
  canManage: boolean;
  domain: ProjectDomainBinding;
  pending: boolean;
  onVerify: (bindingId: string) => void;
}) {
  const { t } = useTranslation("account");
  const { domain } = props;
  if (domain.source !== "custom" || domain.isVerified || !domain.dns) return null;

  return (
    <TableRow
      data-testid={`project-domain-dns-${domain.bindingId}`}
      className="hover:bg-transparent"
    >
      <TableCell colSpan={5} className="bg-muted/30 p-0">
        <div className="relative grid gap-6 px-5 py-5 pl-12">
          <div className="absolute bottom-5 left-6 top-5 w-px bg-border" aria-hidden="true" />

          <section
            className="relative grid gap-3"
            aria-labelledby={`dns-record-${domain.bindingId}`}
          >
            <CircleDot
              className="absolute -left-[2.05rem] top-0.5 size-4 bg-muted text-primary"
              aria-hidden="true"
            />
            <div>
              <h3
                id={`dns-record-${domain.bindingId}`}
                className="text-headline font-semibold text-label-primary"
              >
                {t("SETTINGS_PROJECT_DOMAINS_DNS_STEP_ADD")}
              </h3>
              <p className="mt-1 text-footnote text-label-secondary">
                {t("SETTINGS_PROJECT_DOMAINS_DNS_DESC")}
              </p>
            </div>
            <div className="grid overflow-hidden rounded-lg border border-border bg-card lg:grid-cols-[6rem_minmax(12rem,0.8fr)_minmax(16rem,1.2fr)]">
              <div className="border-b border-border px-3 py-3 lg:border-b-0 lg:border-r">
                <div className="text-footnote text-label-secondary">
                  {t("SETTINGS_PROJECT_DOMAINS_DNS_TYPE")}
                </div>
                <code className="mt-1 block font-mono text-footnote text-label-primary">TXT</code>
              </div>
              <div className="min-w-0 border-b border-border px-3 py-3 lg:border-b-0 lg:border-r">
                <div className="text-footnote text-label-secondary">
                  {t("SETTINGS_PROJECT_DOMAINS_DNS_NAME")}
                </div>
                <code className="mt-1 block overflow-x-auto font-mono text-footnote text-label-primary">
                  {domain.dns.txtRecordName}
                </code>
              </div>
              <div className="min-w-0 px-3 py-3">
                <div className="text-footnote text-label-secondary">
                  {t("SETTINGS_PROJECT_DOMAINS_DNS_VALUE")}
                </div>
                <code className="mt-1 block overflow-x-auto font-mono text-footnote text-label-primary">
                  {domain.dns.txtRecordValue}
                </code>
              </div>
            </div>
          </section>

          <section className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CircleDot
              className="absolute -left-[2.05rem] top-0.5 size-4 bg-muted text-label-tertiary"
              aria-hidden="true"
            />
            <div>
              <h3 className="text-headline font-semibold text-label-primary">
                {t("SETTINGS_PROJECT_DOMAINS_DNS_STEP_VERIFY")}
              </h3>
              <p className="mt-1 text-footnote text-label-secondary">
                {t("SETTINGS_PROJECT_DOMAINS_DNS_VERIFY_DESC")}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={props.pending || !props.canManage}
              onClick={() => props.onVerify(domain.bindingId)}
              data-testid={`project-domain-verify-${domain.bindingId}`}
            >
              <CheckCheck aria-hidden="true" />
              {t("SETTINGS_PROJECT_DOMAINS_VERIFY")}
            </Button>
          </section>
        </div>
      </TableCell>
    </TableRow>
  );
}

type DomainTableProps = {
  canManage: boolean;
  domains: readonly ProjectDomainBinding[];
  pending: boolean;
  onAdd: () => void;
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
        <EmptyContent>
          <Button type="button" disabled={!props.canManage} onClick={props.onAdd}>
            <Plus aria-hidden="true" />
            {t("SETTINGS_PROJECT_DOMAINS_ADD")}
          </Button>
        </EmptyContent>
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
      <DnsVerificationRow
        canManage={props.canManage}
        domain={domain}
        pending={props.pending}
        onVerify={props.onVerify}
      />
    </>
  );
}

type ProjectDomainSettingsPageProps = {
  projectId: string;
  attachment?: ReactNode;
  embedded?: boolean;
};

export function ProjectDomainSettingsPage(props: ProjectDomainSettingsPageProps) {
  const { t } = useTranslation(["account", "common"]);
  const queryClient = useQueryClient();
  const permissionAccess = useProjectPermissionAccess(props.projectId);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [hostname, setHostname] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ProjectDomainBinding | null>(null);
  const queryKey = projectDomainsQueryKey(props.projectId);

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
  const customDomainCount = domains.filter((domain) => domain.source === "custom").length;
  const addDomainButton = (
    <Button
      type="button"
      size={props.embedded ? "sm" : "default"}
      disabled={!canManage}
      onClick={() => setAddDialogOpen(true)}
      data-testid="project-domain-add-trigger"
    >
      <Plus aria-hidden="true" />
      {t("account:SETTINGS_PROJECT_DOMAINS_ADD")}
    </Button>
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
            {props.embedded ? addDomainButton : null}
          </div>
          <DomainTable
            canManage={canManage}
            domains={domains}
            pending={pending}
            onAdd={() => setAddDialogOpen(true)}
            onDelete={setDeleteTarget}
            onToggle={(domain) => void updateMutation.mutateAsync(domain)}
            onVerify={(bindingId) => void verifyMutation.mutateAsync(bindingId)}
          />
        </section>
        {props.attachment ? (
          <section
            className="relative ml-3 border-l border-border pl-8 sm:ml-5 sm:pl-10"
            data-testid="project-domain-release-attachment"
          >
            <div
              className="absolute -left-3 top-0 flex size-6 items-center justify-center rounded-full border border-border bg-card text-primary"
              aria-hidden="true"
            >
              <CircleDot className="size-3" />
            </div>
            {props.attachment}
          </section>
        ) : null}
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
          action={addDomainButton}
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
