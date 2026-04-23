import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  createProjectDomain,
  deleteProjectDomain,
  listProjectDomains,
  updateProjectDomain,
  verifyProjectDomain,
} from "@/api/project-settings";
import { BaseTag } from "@/components/ui/tags";
import { useProjectPermissionAccess } from "@/hooks/use-workspace-permission-access";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import type { SiteDomainOut } from "@arclayer/openapi";

const DOMAIN_QUERY_KEY_PREFIX = ["project", "domains"] as const;

function buildProjectDomainsQueryKey(projectId: string) {
  return [...DOMAIN_QUERY_KEY_PREFIX, projectId] as const;
}

function DomainStatusTag(props: { domain: SiteDomainOut }) {
  const { t } = useTranslation("account");
  if (!props.domain.isVerified) {
    return <BaseTag color="gold">{t("SETTINGS_PROJECT_DOMAINS_STATUS_PENDING")}</BaseTag>;
  }
  if (!props.domain.isActive) {
    return <BaseTag color="default">{t("SETTINGS_PROJECT_DOMAINS_STATUS_DISABLED")}</BaseTag>;
  }
  return <BaseTag color="green">{t("SETTINGS_PROJECT_DOMAINS_STATUS_ACTIVE")}</BaseTag>;
}

function DnsInstruction(props: { domain: SiteDomainOut }) {
  const { t } = useTranslation("account");
  if (props.domain.isVerified) return null;
  return (
    <div className="mt-3 rounded-2xl border border-border/60 bg-muted/20 px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {t("SETTINGS_PROJECT_DOMAINS_DNS_TITLE")}
      </div>
      <div className="mt-2 grid gap-2 text-sm">
        <div className="grid gap-1">
          <span className="text-muted-foreground">{t("SETTINGS_PROJECT_DOMAINS_DNS_NAME")}</span>
          <code className="break-all rounded-lg bg-background px-2 py-1 text-foreground">
            _arclayer-verify.{props.domain.hostname}
          </code>
        </div>
        <div className="grid gap-1">
          <span className="text-muted-foreground">{t("SETTINGS_PROJECT_DOMAINS_DNS_VALUE")}</span>
          <code className="break-all rounded-lg bg-background px-2 py-1 text-foreground">
            {props.domain.verificationToken}
          </code>
        </div>
      </div>
    </div>
  );
}

function DomainRow(props: {
  domain: SiteDomainOut;
  onDelete: (domainId: string) => void;
  onToggle: (domain: SiteDomainOut) => void;
  onVerify: (domainId: string) => void;
  pending: boolean;
}) {
  const { t } = useTranslation("account");
  return (
    <div className="rounded-[22px] border border-border/60 bg-background/80 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-foreground">
              {props.domain.hostname}
            </span>
            <DomainStatusTag domain={props.domain} />
          </div>
          <div className="mt-1 text-xs text-muted-foreground">{props.domain.domainId}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!props.domain.isVerified ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={props.pending}
              onClick={() => props.onVerify(props.domain.domainId)}
            >
              {t("SETTINGS_PROJECT_DOMAINS_VERIFY")}
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={props.pending}
              onClick={() => props.onToggle(props.domain)}
            >
              {props.domain.isActive
                ? t("SETTINGS_PROJECT_DOMAINS_DISABLE")
                : t("SETTINGS_PROJECT_DOMAINS_ENABLE")}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={props.pending}
            aria-label={t("SETTINGS_PROJECT_DOMAINS_DELETE")}
            onClick={() => props.onDelete(props.domain.domainId)}
          >
            <Trash2 size={16} />
          </Button>
        </div>
      </div>
      <DnsInstruction domain={props.domain} />
    </div>
  );
}

export function ProjectDomainSettingsPage(props: { projectId: string }) {
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
    mutationFn: async (domainId: string) => verifyProjectDomain(props.projectId, domainId),
    onSuccess: async () => {
      notifySuccessText(t("account:SETTINGS_PROJECT_DOMAINS_VERIFIED"));
      await invalidate();
    },
    onError: (error) => notifyError(error),
  });

  const updateMutation = useMutation({
    mutationFn: async (domain: SiteDomainOut) =>
      updateProjectDomain(props.projectId, domain.domainId, { isActive: !domain.isActive }),
    onSuccess: async () => {
      notifySuccessText(t("common:SETTINGS_SAVED"));
      await invalidate();
    },
    onError: (error) => notifyError(error),
  });

  const deleteMutation = useMutation({
    mutationFn: async (domainId: string) => deleteProjectDomain(props.projectId, domainId),
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

  return (
    <DefaultPage
      title={t("account:SETTINGS_NAV_PROJECT_DOMAIN")}
      description={t("account:SETTINGS_PROJECT_DOMAINS_DESC")}
      showFavoriteToggle={false}
      pageFrame="full"
      largeViewportGutters={false}
      className="min-h-full"
      contentClassName="min-h-full"
      contentContainerClassName="min-h-full"
    >
      <ContentGuard
        loading={domainsQuery.isLoading}
        loadingVariant="form"
        error={domainsQuery.error}
        onRetry={domainsQuery.isError ? () => void domainsQuery.refetch() : undefined}
      >
        <div className="grid gap-6">
          {permissionReady && !canManageDomains ? (
            <div
              className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground"
              data-testid="project-domains-read-only-notice"
            >
              {t("account:SETTINGS_PROJECT_READ_ONLY_DESC")}
            </div>
          ) : null}
          <form
            className="rounded-[28px] border border-border/60 bg-card/60 p-5"
            onSubmit={(event) => {
              event.preventDefault();
              if (!hostname.trim() || !canManageDomains) return;
              void createMutation.mutateAsync();
            }}
          >
            <div className="max-w-2xl">
              <div className="text-sm font-semibold text-foreground">
                {t("account:SETTINGS_PROJECT_DOMAINS_ADD_TITLE")}
              </div>
              <div className="mt-1 text-sm leading-6 text-muted-foreground">
                {t("account:SETTINGS_PROJECT_DOMAINS_ADD_DESC")}
              </div>
            </div>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <Input
                value={hostname}
                onChange={(event) => setHostname(event.target.value)}
                placeholder={t("account:SETTINGS_PROJECT_DOMAINS_PLACEHOLDER")}
                autoComplete="off"
                disabled={!canManageDomains}
              />
              <Button
                type="submit"
                loading={createMutation.isPending}
                disabled={!hostname.trim() || !canManageDomains}
              >
                <Plus size={16} />
                {t("account:SETTINGS_PROJECT_DOMAINS_ADD")}
              </Button>
            </div>
          </form>

          <div className="grid gap-3" data-testid="project-domain-settings-list">
            {domains.length > 0 ? (
              domains.map((domain) => (
                <DomainRow
                  key={domain.domainId}
                  domain={domain}
                  pending={pending || !canManageDomains}
                  onDelete={(domainId) => void deleteMutation.mutateAsync(domainId)}
                  onToggle={(nextDomain) => void updateMutation.mutateAsync(nextDomain)}
                  onVerify={(domainId) => void verifyMutation.mutateAsync(domainId)}
                />
              ))
            ) : (
              <div className="rounded-[28px] border border-dashed border-border/70 bg-background/80 px-5 py-8 text-sm text-muted-foreground">
                {t("account:SETTINGS_PROJECT_DOMAINS_EMPTY")}
              </div>
            )}
          </div>
        </div>
      </ContentGuard>
    </DefaultPage>
  );
}
