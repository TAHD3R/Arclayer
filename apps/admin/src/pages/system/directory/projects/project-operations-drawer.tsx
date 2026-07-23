import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  Activity,
  CalendarClock,
  ChartNoAxesCombined,
  CircleDollarSign,
  ExternalLink,
  Gauge,
  Globe2,
  KeyRound,
  LayoutTemplate,
  Pencil,
  Power,
  PowerOff,
  Rocket,
  ServerCog,
  Settings2,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";

import { ProjectAvatar } from "@/components/common/project-avatar";
import { UserAvatar, WorkspaceAvatar } from "@/components/common/entity-avatar";
import { BaseTag } from "@/components/ui/tags";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { auditEventName, auditSourceLabel } from "@/pages/system/audit-log/audit-event-presenters";
import type { SystemDirectoryProject } from "@arclayer/openapi/admin-types";
import { Button } from "@arclayer/ui/button";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@arclayer/ui/drawer";
import { Separator } from "@arclayer/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@arclayer/ui/tabs";

import { useSystemDirectoryProjectDetail } from "../hooks";
import { isDirectoryRestrictionActive } from "../restriction-state";
import { useSystemDirectoryDateTimeFormatter } from "../system-directory-table";
import {
  useSystemProjectActivity,
  useSystemProjectOperations,
  useSystemProjectUsage,
} from "./project-operations-hooks";

export type ProjectOperationsTab =
  | "overview"
  | "runtime"
  | "access"
  | "usage"
  | "activity"
  | "actions";

function DetailFact(props: { label: string; children: ReactNode; numeric?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-label-secondary">{props.label}</dt>
      <dd
        className={
          props.numeric
            ? "mt-1 truncate text-headline font-semibold tabular-nums text-label-primary"
            : "mt-1 truncate text-footnote font-medium text-label-primary"
        }
      >
        {props.children}
      </dd>
    </div>
  );
}

function SectionHeading(props: { icon: ReactNode; title: string; description?: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-label-secondary">
        {props.icon}
      </div>
      <div className="min-w-0">
        <h3 className="text-headline font-semibold text-label-primary">{props.title}</h3>
        {props.description ? (
          <p className="mt-0.5 text-footnote text-label-secondary">{props.description}</p>
        ) : null}
      </div>
    </div>
  );
}

function healthTone(health: string) {
  if (health === "healthy") return "green" as const;
  if (health === "degraded") return "red" as const;
  if (health === "inactive") return "gold" as const;
  return "default" as const;
}

function deploymentTone(status: string) {
  if (status === "ready" || status === "promoted") return "green" as const;
  if (status === "failed" || status === "canceled") return "red" as const;
  return "gold" as const;
}

export function ProjectOperationsDrawer(props: {
  project: SystemDirectoryProject | null;
  initialTab?: ProjectOperationsTab;
  onOpenChange: (open: boolean) => void;
  onEdit: (project: SystemDirectoryProject) => void;
  onChangeIcon: (project: SystemDirectoryProject) => void;
  onToggleAccess: (project: SystemDirectoryProject) => void;
  onDelete: (project: SystemDirectoryProject) => void;
}) {
  const { t, i18n } = useTranslation(["settings", "account", "platform", "activity", "common"]);
  const projectId = props.project?.projectId ?? null;
  const [tab, setTab] = useState<ProjectOperationsTab>(props.initialTab ?? "overview");
  const dateTime = useSystemDirectoryDateTimeFormatter();
  const detailQuery = useSystemDirectoryProjectDetail(projectId);
  const operationsQuery = useSystemProjectOperations(
    projectId,
    tab === "runtime" || tab === "access",
  );
  const usage = useSystemProjectUsage(projectId, tab === "usage");
  const activityQuery = useSystemProjectActivity(projectId, tab === "activity");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const number = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const currency = useMemo(
    () => new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }),
    [locale],
  );
  const exactDateTime = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: dateTime.localization.timeZone,
      }),
    [dateTime.localization.timeZone, locale],
  );

  useEffect(() => {
    if (!projectId) return;
    setTab(props.initialTab ?? "overview");
  }, [projectId, props.initialTab]);

  const detail = detailQuery.detail;
  const operations = operationsQuery.data;
  const restricted = props.project
    ? isDirectoryRestrictionActive(props.project, "project_suspended")
    : false;
  const restriction = detail?.restrictions?.find(
    (item) => item.restrictionType === "project_suspended" && item.state === "active",
  );
  const ownerName =
    detail?.owner?.displayName?.trim() ||
    detail?.owner?.username?.trim() ||
    detail?.owner?.email?.trim() ||
    t("settings:SETTINGS_SYSTEM_DIRECTORY_OWNER_UNAVAILABLE");
  const formatExactDateTime = (value: string) => exactDateTime.format(new Date(value));
  const runAction = (action: (project: SystemDirectoryProject) => void) => {
    if (!props.project) return;
    props.onOpenChange(false);
    action(props.project);
  };

  return (
    <Drawer open={Boolean(props.project)} onOpenChange={props.onOpenChange} direction="right">
      <DrawerContent className="w-full sm:max-w-3xl">
        <DrawerHeader className="max-w-none gap-3 rounded-none px-5 py-4 pr-14 text-left">
          <div className="flex min-w-0 items-center gap-3">
            {props.project ? (
              <ProjectAvatar
                name={props.project.name}
                size={40}
                iconMode={props.project.iconMode}
                iconColor={props.project.iconColor}
                iconGlyph={props.project.iconGlyph}
                iconEmoji={props.project.iconEmoji}
                assetRef={props.project.iconUrl}
              />
            ) : null}
            <div className="min-w-0 flex-1">
              <DrawerTitle className="truncate text-title3 font-semibold">
                {props.project?.name ??
                  t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_PROJECT_TITLE")}
              </DrawerTitle>
              <DrawerDescription className="mt-0.5">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_PROJECT_DESC")}
              </DrawerDescription>
            </div>
            <BaseTag color={restricted ? "red" : "green"}>
              {t(
                restricted
                  ? "settings:SETTINGS_SYSTEM_DIRECTORY_STATUS_DISABLED"
                  : "settings:SETTINGS_SYSTEM_DIRECTORY_ACTIVE",
              )}
            </BaseTag>
          </div>
        </DrawerHeader>

        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as ProjectOperationsTab)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="border-b px-5">
            <TabsList className="h-11 w-full justify-start gap-1 overflow-x-auto rounded-none bg-transparent p-0">
              <TabsTrigger value="overview">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_TAB_OVERVIEW")}
              </TabsTrigger>
              <TabsTrigger value="runtime">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_PROJECT_TAB_RUNTIME")}
              </TabsTrigger>
              <TabsTrigger value="access">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_PROJECT_TAB_ACCESS")}
              </TabsTrigger>
              <TabsTrigger value="usage">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_PROJECT_TAB_USAGE")}
              </TabsTrigger>
              <TabsTrigger value="activity">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_TAB_ACTIVITY")}
              </TabsTrigger>
              <TabsTrigger value="actions">
                {t("settings:SETTINGS_SYSTEM_DIRECTORY_PROJECT_TAB_ACTIONS")}
              </TabsTrigger>
            </TabsList>
          </div>

          <DrawerBody className="min-h-0 max-w-none flex-1 overflow-y-auto px-5 py-5">
            <TabsContent value="overview" className="mt-0 space-y-6">
              <ContentGuard
                loading={detailQuery.isLoading}
                error={detailQuery.error}
                onRetry={() => void detailQuery.refetch()}
                loadingVariant="form"
                variant="compact"
              >
                {detail ? (
                  <>
                    <section className="space-y-4">
                      <div className="flex items-start justify-between gap-4">
                        <SectionHeading
                          icon={<LayoutTemplate className="size-4" />}
                          title={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_SECTION_OVERVIEW")}
                          description={detail.description ?? undefined}
                        />
                        <Button asChild size="sm" variant="outline">
                          <Link to="/projects/$projectId" params={{ projectId: detail.projectId }}>
                            <ExternalLink className="size-3.5" />
                            {t("settings:SETTINGS_SYSTEM_DIRECTORY_PROJECT_OPEN")}
                          </Link>
                        </Button>
                      </div>
                      <dl className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
                        <DetailFact
                          label={t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_WORKSPACE")}
                        >
                          <span className="inline-flex items-center gap-2">
                            <WorkspaceAvatar name={detail.workspaceName} size={22} />
                            {detail.workspaceName}
                          </span>
                        </DetailFact>
                        <DetailFact label={t("settings:SETTINGS_SYSTEM_DIRECTORY_PROJECT_SLUG")}>
                          <span className="font-mono">{detail.slug}</span>
                        </DetailFact>
                        <DetailFact
                          label={t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_MEMBERS")}
                          numeric
                        >
                          {number.format(detail.memberCount)}
                        </DetailFact>
                        <DetailFact
                          label={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_UPDATED_AT")}
                        >
                          {formatExactDateTime(detail.updatedAt)}
                        </DetailFact>
                        <DetailFact
                          label={t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_CREATED_AT")}
                        >
                          {formatExactDateTime(detail.createdAt)}
                        </DetailFact>
                      </dl>
                    </section>
                    <Separator />
                    <section className="space-y-4">
                      <SectionHeading
                        icon={<Users className="size-4" />}
                        title={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_SECTION_OWNER")}
                      />
                      <div className="flex items-center gap-3 rounded-lg border p-4">
                        <UserAvatar name={ownerName} assetRef={detail.owner?.avatarUrl} size={36} />
                        <div className="min-w-0">
                          <div className="truncate text-headline font-semibold text-label-primary">
                            {ownerName}
                          </div>
                          {detail.owner?.email ? (
                            <div className="truncate text-footnote text-label-secondary">
                              {detail.owner.email}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </section>
                  </>
                ) : null}
              </ContentGuard>
            </TabsContent>

            <TabsContent value="runtime" className="mt-0 space-y-6">
              <ContentGuard
                loading={operationsQuery.isLoading}
                error={operationsQuery.error}
                onRetry={() => void operationsQuery.refetch()}
                loadingVariant="table"
                variant="compact"
              >
                {operations ? (
                  <>
                    <section className="space-y-4">
                      <div className="flex items-start justify-between gap-4">
                        <SectionHeading
                          icon={<ServerCog className="size-4" />}
                          title={t("settings:SETTINGS_SYSTEM_DIRECTORY_PROJECT_RUNTIME_TITLE")}
                          description={t(
                            "settings:SETTINGS_SYSTEM_DIRECTORY_PROJECT_RUNTIME_SOURCE",
                            {
                              time: formatExactDateTime(operations.collectedAt),
                            },
                          )}
                        />
                        <BaseTag color={healthTone(operations.health)}>
                          {t(
                            `settings:SETTINGS_SYSTEM_DIRECTORY_PROJECT_HEALTH_${operations.health.toUpperCase()}`,
                          )}
                        </BaseTag>
                      </div>
                      {operations.runtime ? (
                        <dl className="grid gap-4 rounded-lg border p-4 sm:grid-cols-3">
                          <DetailFact
                            label={t("settings:SETTINGS_SYSTEM_DIRECTORY_PROJECT_RUNTIME_KIND")}
                          >
                            {operations.runtime.kind}
                          </DetailFact>
                          <DetailFact
                            label={t("settings:SETTINGS_SYSTEM_DIRECTORY_PROJECT_RUNTIME_NAME")}
                          >
                            {operations.runtime.name}
                          </DetailFact>
                          <DetailFact
                            label={t("settings:SETTINGS_SYSTEM_DIRECTORY_PROJECT_RUNTIME_LOCALE")}
                          >
                            {operations.runtime.defaultLocale}
                          </DetailFact>
                        </dl>
                      ) : (
                        <div className="rounded-lg border border-dashed p-4 text-footnote text-label-secondary">
                          {t(
                            `settings:SETTINGS_SYSTEM_DIRECTORY_PROJECT_RUNTIME_${operations.runtimeState.toUpperCase()}`,
                          )}
                        </div>
                      )}
                    </section>
                    <Separator />
                    <section className="space-y-4">
                      <SectionHeading
                        icon={<Gauge className="size-4" />}
                        title={t("settings:SETTINGS_SYSTEM_DIRECTORY_PROJECT_ENVIRONMENTS")}
                      />
                      <div className="divide-y rounded-lg border">
                        {operations.environments.map((environment) => (
                          <div key={environment.id} className="flex items-center gap-3 px-4 py-3">
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-footnote font-medium text-label-primary">
                                {environment.name}
                              </div>
                              <div className="font-mono text-caption text-label-secondary">
                                {environment.key}
                              </div>
                            </div>
                            {environment.isProduction ? (
                              <BaseTag color="green">
                                {t("settings:SETTINGS_SYSTEM_DIRECTORY_PROJECT_PRODUCTION")}
                              </BaseTag>
                            ) : null}
                            {environment.isDefaultPreview ? (
                              <BaseTag>
                                {t("settings:SETTINGS_SYSTEM_DIRECTORY_PROJECT_PREVIEW")}
                              </BaseTag>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </section>
                    <Separator />
                    <section className="space-y-4">
                      <div className="flex items-start justify-between gap-4">
                        <SectionHeading
                          icon={<Rocket className="size-4" />}
                          title={t("settings:SETTINGS_SYSTEM_DIRECTORY_PROJECT_DEPLOYMENTS")}
                        />
                        {projectId ? (
                          <Button asChild size="sm" variant="ghost">
                            <Link to="/projects/$projectId/deployments" params={{ projectId }}>
                              {t("settings:SETTINGS_SYSTEM_DIRECTORY_PROJECT_VIEW_ALL")}
                              <ExternalLink className="size-3.5" />
                            </Link>
                          </Button>
                        ) : null}
                      </div>
                      <div className="divide-y rounded-lg border">
                        {operations.deployments.map((deployment) => (
                          <div key={deployment.id} className="flex items-center gap-3 px-4 py-3">
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-footnote font-medium text-label-primary">
                                {deployment.environmentName}
                              </div>
                              <div className="truncate font-mono text-caption text-label-secondary">
                                {deployment.sourceRef}
                              </div>
                            </div>
                            <BaseTag>{deployment.runtimeKind}</BaseTag>
                            <BaseTag color={deploymentTone(deployment.status)}>
                              {t(
                                `account:SETTINGS_PROJECT_DEPLOYMENTS_STATUS_${deployment.status.toUpperCase()}`,
                              )}
                            </BaseTag>
                          </div>
                        ))}
                      </div>
                    </section>
                    <Separator />
                    <section className="space-y-4">
                      <div className="flex items-start justify-between gap-4">
                        <SectionHeading
                          icon={<Globe2 className="size-4" />}
                          title={t("settings:SETTINGS_SYSTEM_DIRECTORY_PROJECT_DOMAINS")}
                        />
                        {projectId ? (
                          <Button asChild size="sm" variant="ghost">
                            <Link to="/projects/$projectId/website/domain" params={{ projectId }}>
                              {t("settings:SETTINGS_SYSTEM_DIRECTORY_PROJECT_MANAGE")}
                              <ExternalLink className="size-3.5" />
                            </Link>
                          </Button>
                        ) : null}
                      </div>
                      <div className="divide-y rounded-lg border">
                        {operations.domains.map((domain) => (
                          <div key={domain.bindingId} className="flex items-center gap-3 px-4 py-3">
                            <div className="min-w-0 flex-1 truncate font-mono text-footnote text-label-primary">
                              {domain.hostname}
                            </div>
                            {domain.isPrimary ? (
                              <BaseTag>
                                {t("settings:SETTINGS_SYSTEM_DIRECTORY_PROJECT_PRIMARY")}
                              </BaseTag>
                            ) : null}
                            <BaseTag color={domain.isVerified ? "green" : "gold"}>
                              {t(
                                domain.isVerified
                                  ? "settings:SETTINGS_SYSTEM_DIRECTORY_PROJECT_DOMAIN_VERIFIED"
                                  : "settings:SETTINGS_SYSTEM_DIRECTORY_PROJECT_DOMAIN_PENDING",
                              )}
                            </BaseTag>
                          </div>
                        ))}
                      </div>
                    </section>
                  </>
                ) : null}
              </ContentGuard>
            </TabsContent>

            <TabsContent value="access" className="mt-0 space-y-6">
              <ContentGuard
                loading={operationsQuery.isLoading || detailQuery.isLoading}
                error={operationsQuery.error ?? detailQuery.error}
                onRetry={() => void Promise.all([operationsQuery.refetch(), detailQuery.refetch()])}
                loadingVariant="table"
                variant="compact"
              >
                {operations ? (
                  <>
                    <section className="space-y-4">
                      <SectionHeading
                        icon={<Users className="size-4" />}
                        title={t("settings:SETTINGS_SYSTEM_DIRECTORY_PROJECT_ACCESS_MEMBERS")}
                        description={t(
                          "settings:SETTINGS_SYSTEM_DIRECTORY_PROJECT_ACCESS_MEMBERS_DESC",
                          { count: operations.memberTotal },
                        )}
                      />
                      <div className="divide-y rounded-lg border">
                        {operations.members.map((member) => {
                          const name =
                            member.displayName?.trim() || member.username || member.email || "—";
                          return (
                            <div key={member.id} className="flex items-center gap-3 px-4 py-3">
                              <UserAvatar name={name} assetRef={member.avatarUrl} size={32} />
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-footnote font-medium text-label-primary">
                                  {name}
                                </div>
                                <div className="truncate text-caption text-label-secondary">
                                  {member.email}
                                </div>
                              </div>
                              <BaseTag>
                                {t(`account:SETTINGS_PROJECT_ROLE_${member.role.toUpperCase()}`)}
                              </BaseTag>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                    <Separator />
                    <section className="space-y-4">
                      <SectionHeading
                        icon={<KeyRound className="size-4" />}
                        title={t("settings:SETTINGS_SYSTEM_DIRECTORY_PROJECT_RESTRICTION_TITLE")}
                      />
                      {restriction ? (
                        <dl className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
                          <DetailFact
                            label={t("settings:SETTINGS_ACCESS_RESTRICTION_CURRENT_REASON")}
                          >
                            {t(
                              `settings:SETTINGS_ACCESS_RESTRICTION_REASON_${restriction.reasonCategory.toUpperCase()}`,
                            )}
                          </DetailFact>
                          <DetailFact
                            label={t(
                              "settings:SETTINGS_SYSTEM_DIRECTORY_PROJECT_RESTRICTION_EFFECTIVE",
                            )}
                          >
                            {formatExactDateTime(restriction.effectiveAt)}
                          </DetailFact>
                          <div className="sm:col-span-2">
                            <DetailFact
                              label={t("settings:SETTINGS_ACCESS_RESTRICTION_OPERATOR_NOTE_LABEL")}
                            >
                              {restriction.operatorNote}
                            </DetailFact>
                          </div>
                        </dl>
                      ) : (
                        <div className="flex items-center gap-3 rounded-lg border p-4 text-footnote text-label-secondary">
                          <ShieldCheck className="size-4 text-positive" />
                          {t("settings:SETTINGS_SYSTEM_DIRECTORY_PROJECT_RESTRICTION_NONE")}
                        </div>
                      )}
                    </section>
                  </>
                ) : null}
              </ContentGuard>
            </TabsContent>

            <TabsContent value="usage" className="mt-0 space-y-6">
              <ContentGuard
                loading={usage.overview.isLoading || usage.groups.isLoading}
                error={usage.overview.error ?? usage.groups.error}
                onRetry={() => void Promise.all([usage.overview.refetch(), usage.groups.refetch()])}
                loadingVariant="form"
                variant="compact"
              >
                {usage.overview.data ? (
                  <>
                    <section className="space-y-4">
                      <SectionHeading
                        icon={<ChartNoAxesCombined className="size-4" />}
                        title={t("settings:SETTINGS_SYSTEM_DIRECTORY_PROJECT_USAGE_TITLE")}
                        description={t("settings:SETTINGS_SYSTEM_DIRECTORY_PROJECT_USAGE_DESC", {
                          start: usage.overview.data.period.startDate,
                          end: usage.overview.data.period.endDate,
                        })}
                      />
                      <dl className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 lg:grid-cols-3">
                        <div className="bg-card p-4">
                          <DetailFact label={t("platform:METRIC_HTTP_REQUESTS")} numeric>
                            {number.format(usage.overview.data.http.requests)}
                          </DetailFact>
                        </div>
                        <div className="bg-card p-4">
                          <DetailFact label={t("platform:METRIC_HTTP_ERRORS")} numeric>
                            {number.format(usage.overview.data.http.errorRequests)}
                          </DetailFact>
                        </div>
                        <div className="bg-card p-4">
                          <DetailFact label={t("platform:METRIC_HTTP_P95_LATENCY")} numeric>
                            {usage.overview.data.http.p95LatencyMs === null
                              ? "—"
                              : `${number.format(usage.overview.data.http.p95LatencyMs)} ms`}
                          </DetailFact>
                        </div>
                        <div className="bg-card p-4">
                          <DetailFact label={t("platform:METRIC_AI_REQUESTS")} numeric>
                            {number.format(usage.overview.data.ai.requests)}
                          </DetailFact>
                        </div>
                        <div className="bg-card p-4">
                          <DetailFact label={t("platform:METRIC_TOTAL_TOKENS")} numeric>
                            {number.format(usage.overview.data.ai.totalTokens)}
                          </DetailFact>
                        </div>
                        <div className="bg-card p-4">
                          <DetailFact label={t("platform:METRIC_AI_COST")} numeric>
                            {currency.format(usage.overview.data.ai.costMicros / 1_000_000)}
                          </DetailFact>
                        </div>
                      </dl>
                    </section>
                    <Separator />
                    <section className="space-y-4">
                      <SectionHeading
                        icon={<CircleDollarSign className="size-4" />}
                        title={t("settings:SETTINGS_SYSTEM_DIRECTORY_PROJECT_USAGE_MODELS")}
                      />
                      <div className="divide-y rounded-lg border">
                        {(usage.groups.data?.items ?? []).map((group) => (
                          <div
                            key={`${group.provider}:${group.model}`}
                            className="flex items-center gap-3 px-4 py-3"
                          >
                            <BaseTag>{group.provider}</BaseTag>
                            <div className="min-w-0 flex-1 truncate font-mono text-footnote text-label-primary">
                              {group.model}
                            </div>
                            <span className="tabular-nums text-footnote text-label-secondary">
                              {number.format(group.requests)}
                            </span>
                            <span className="tabular-nums text-footnote font-medium text-label-primary">
                              {currency.format(group.costMicros / 1_000_000)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </section>
                  </>
                ) : null}
              </ContentGuard>
            </TabsContent>

            <TabsContent value="activity" className="mt-0 space-y-4">
              <SectionHeading
                icon={<Activity className="size-4" />}
                title={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_ACTIVITY_TITLE")}
                description={t("settings:SETTINGS_SYSTEM_DIRECTORY_PROJECT_ACTIVITY_DESC")}
              />
              <ContentGuard
                loading={activityQuery.isLoading}
                error={activityQuery.error}
                empty={
                  !activityQuery.isLoading &&
                  !activityQuery.error &&
                  !activityQuery.data?.items.length
                }
                onRetry={() => void activityQuery.refetch()}
                loadingVariant="table"
                variant="compact"
              >
                <div className="divide-y rounded-lg border">
                  {(activityQuery.data?.items ?? []).map((event) => {
                    const actor =
                      event.actor?.displayName?.trim() ||
                      event.actor?.username?.trim() ||
                      t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTIVITY_SYSTEM_ACTOR");
                    return (
                      <div key={event.id} className="flex items-start gap-3 px-4 py-3">
                        <UserAvatar name={actor} assetRef={event.actor?.avatarUrl} size={32} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-footnote font-medium text-label-primary">
                            {auditEventName(t, event.eventName)}
                          </div>
                          <div className="mt-0.5 truncate text-caption text-label-secondary">
                            {actor}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="flex items-center gap-1 text-caption tabular-nums text-label-secondary">
                            <CalendarClock className="size-3" />
                            {formatExactDateTime(event.occurredAt)}
                          </div>
                          <div className="mt-1 font-mono text-[11px] text-label-tertiary">
                            {auditSourceLabel(t, event.source)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ContentGuard>
            </TabsContent>

            <TabsContent value="actions" className="mt-0 space-y-6">
              <SectionHeading
                icon={<Settings2 className="size-4" />}
                title={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_SECTION_ACTIONS")}
                description={t("settings:SETTINGS_SYSTEM_DIRECTORY_PROJECT_ACTIONS_DESC")}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <Button
                  variant="outline"
                  className="justify-start"
                  onClick={() => runAction(props.onEdit)}
                >
                  <Pencil className="size-4" />
                  {t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_EDIT_PROJECT")}
                </Button>
                <Button
                  variant="outline"
                  className="justify-start"
                  onClick={() => runAction(props.onChangeIcon)}
                >
                  <Settings2 className="size-4" />
                  {t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_CHANGE_ICON")}
                </Button>
                <Button
                  variant="outline"
                  className="justify-start"
                  onClick={() => runAction(props.onToggleAccess)}
                >
                  {restricted ? <Power className="size-4" /> : <PowerOff className="size-4" />}
                  {t(
                    restricted
                      ? "settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_ENABLE_PROJECT"
                      : "settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DISABLE_PROJECT",
                  )}
                </Button>
                <Button
                  variant="destructive"
                  className="justify-start"
                  onClick={() => runAction(props.onDelete)}
                >
                  <Trash2 className="size-4" />
                  {t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_DELETE_PROJECT")}
                </Button>
              </div>
            </TabsContent>
          </DrawerBody>
        </Tabs>
      </DrawerContent>
    </Drawer>
  );
}
