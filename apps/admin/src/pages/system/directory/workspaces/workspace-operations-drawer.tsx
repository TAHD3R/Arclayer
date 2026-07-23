import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Activity,
  Archive,
  CalendarClock,
  CircleDollarSign,
  Coins,
  FolderKanban,
  Gauge,
  LayoutTemplate,
  PowerOff,
  RefreshCw,
  Users,
} from "lucide-react";

import { WorkspaceAvatar, UserAvatar } from "@/components/common/entity-avatar";
import { BaseTag } from "@/components/ui/tags";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { auditEventName, auditSourceLabel } from "@/pages/system/audit-log/audit-event-presenters";
import type { SystemDirectoryWorkspace } from "@arclayer/openapi/admin-types";
import { Button } from "@arclayer/ui/button";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@arclayer/ui/drawer";
import { Progress } from "@arclayer/ui/progress";
import { Separator } from "@arclayer/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@arclayer/ui/tabs";

import { useSystemDirectoryWorkspaceDetail } from "../hooks";
import { isDirectoryRestrictionActive } from "../restriction-state";
import { useSystemDirectoryDateTimeFormatter } from "../system-directory-table";
import {
  useSystemWorkspaceActivity,
  useSystemWorkspaceCommerce,
  useSystemWorkspaceProjects,
} from "./workspace-operations-hooks";
import { WorkspacePlanAdjustmentDialog } from "./workspace-plan-adjustment-dialog";

export type WorkspaceOperationsTab = "overview" | "members" | "billing" | "activity";

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

function usagePercent(spent: number, granted: number) {
  if (granted <= 0) return 0;
  return Math.min(100, Math.max(0, (spent / granted) * 100));
}

function statusLabelKey(status: string) {
  return `settings:SETTINGS_SYSTEM_DIRECTORY_SUBSCRIPTION_STATUS_${status.toUpperCase()}`;
}

export function WorkspaceOperationsDrawer(props: {
  workspace: SystemDirectoryWorkspace | null;
  initialTab?: WorkspaceOperationsTab;
  initialPlanAdjustmentOpen?: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, i18n } = useTranslation(["settings", "commerce", "activity", "platform", "common"]);
  const workspaceId = props.workspace?.workspaceId ?? null;
  const [tab, setTab] = useState<WorkspaceOperationsTab>(props.initialTab ?? "overview");
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const dateTime = useSystemDirectoryDateTimeFormatter();
  const detailQuery = useSystemDirectoryWorkspaceDetail(workspaceId);
  const commerceQuery = useSystemWorkspaceCommerce(workspaceId, Boolean(workspaceId));
  const projectsQuery = useSystemWorkspaceProjects(workspaceId, tab === "members");
  const activityQuery = useSystemWorkspaceActivity(workspaceId, tab === "activity");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const number = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const exactDateTime = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: dateTime.localization.timeZone,
      }),
    [dateTime.localization.timeZone, locale],
  );
  const currency = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency: commerceQuery.data?.plan.currency ?? "USD",
        maximumFractionDigits: 4,
      }),
    [commerceQuery.data?.plan.currency, locale],
  );

  useEffect(() => {
    if (!workspaceId) return;
    setTab(props.initialTab ?? "overview");
    setPlanDialogOpen(Boolean(props.initialPlanAdjustmentOpen));
  }, [props.initialPlanAdjustmentOpen, props.initialTab, workspaceId]);

  const overview = commerceQuery.data ?? null;
  const formatExactDateTime = (value: string) => exactDateTime.format(new Date(value));
  const detail = detailQuery.detail;
  const isArchived = props.workspace
    ? isDirectoryRestrictionActive(props.workspace, "workspace_archived")
    : false;
  const isSuspended = props.workspace
    ? isDirectoryRestrictionActive(props.workspace, "workspace_suspended")
    : false;
  const ownerName =
    detail?.owner?.displayName?.trim() ||
    detail?.owner?.username?.trim() ||
    detail?.owner?.email?.trim() ||
    t("settings:SETTINGS_SYSTEM_DIRECTORY_OWNER_UNAVAILABLE");

  return (
    <>
      <Drawer open={Boolean(props.workspace)} onOpenChange={props.onOpenChange} direction="right">
        <DrawerContent className="w-full sm:max-w-2xl">
          <DrawerHeader className="max-w-none gap-3 rounded-none px-5 py-4 pr-14 text-left">
            <div className="flex min-w-0 items-center gap-3">
              {props.workspace ? (
                <WorkspaceAvatar
                  name={props.workspace.name}
                  size={40}
                  iconMode={props.workspace.iconMode}
                  iconColor={props.workspace.iconColor}
                  iconGlyph={props.workspace.iconGlyph}
                  iconEmoji={props.workspace.iconEmoji}
                  assetRef={props.workspace.iconUrl}
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <DrawerTitle className="truncate text-title3 font-semibold">
                  {props.workspace?.name ??
                    t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_WORKSPACE_TITLE")}
                </DrawerTitle>
                <DrawerDescription className="mt-0.5">
                  {t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_WORKSPACE_DESC")}
                </DrawerDescription>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {isArchived ? (
                  <BaseTag color="gold" icon={<Archive className="size-3" />}>
                    {t("settings:SETTINGS_SYSTEM_DIRECTORY_ARCHIVED")}
                  </BaseTag>
                ) : (
                  <BaseTag
                    color={isSuspended ? "red" : "green"}
                    icon={
                      isSuspended ? (
                        <PowerOff className="size-3" />
                      ) : (
                        <LayoutTemplate className="size-3" />
                      )
                    }
                  >
                    {t(
                      isSuspended
                        ? "settings:SETTINGS_SYSTEM_DIRECTORY_STATUS_DISABLED"
                        : "settings:SETTINGS_SYSTEM_DIRECTORY_ACTIVE",
                    )}
                  </BaseTag>
                )}
              </div>
            </div>
          </DrawerHeader>

          <Tabs
            value={tab}
            onValueChange={(value) => setTab(value as WorkspaceOperationsTab)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="border-b px-5">
              <TabsList className="h-11 w-full justify-start gap-1 overflow-x-auto rounded-none bg-transparent p-0">
                <TabsTrigger value="overview">
                  {t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_TAB_OVERVIEW")}
                </TabsTrigger>
                <TabsTrigger value="members">
                  {t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_TAB_MEMBERS_PROJECTS")}
                </TabsTrigger>
                <TabsTrigger value="billing">
                  {t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_TAB_BILLING")}
                </TabsTrigger>
                <TabsTrigger value="activity">
                  {t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_TAB_ACTIVITY")}
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
                        <SectionHeading
                          icon={<LayoutTemplate className="size-4" />}
                          title={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_SECTION_OVERVIEW")}
                        />
                        {detail.description ? (
                          <p className="text-footnote leading-6 text-label-secondary">
                            {detail.description}
                          </p>
                        ) : null}
                        <dl className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
                          <DetailFact
                            label={t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_MEMBERS")}
                            numeric
                          >
                            {number.format(detail.memberCount)}
                          </DetailFact>
                          <DetailFact
                            label={t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_PROJECTS")}
                            numeric
                          >
                            {number.format(detail.projectCount)}
                          </DetailFact>
                          <DetailFact
                            label={t("settings:SETTINGS_SYSTEM_DIRECTORY_COLUMN_CREATED_AT")}
                          >
                            {formatExactDateTime(detail.createdAt)}
                          </DetailFact>
                          <DetailFact
                            label={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_UPDATED_AT")}
                          >
                            {formatExactDateTime(detail.updatedAt)}
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
                          <UserAvatar
                            name={ownerName}
                            assetRef={detail.owner?.avatarUrl}
                            size={36}
                          />
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

                <ContentGuard
                  loading={commerceQuery.isLoading}
                  error={commerceQuery.error}
                  onRetry={() => void commerceQuery.refetch()}
                  loadingVariant="form"
                  variant="compact"
                >
                  {overview ? (
                    <section className="space-y-4">
                      <SectionHeading
                        icon={<CircleDollarSign className="size-4" />}
                        title={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_COMMERCIAL_SNAPSHOT")}
                        description={t(
                          "settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_COMMERCIAL_SNAPSHOT_DESC",
                        )}
                      />
                      <dl className="grid gap-4 rounded-lg border p-4 sm:grid-cols-3">
                        <DetailFact label={t("settings:SETTINGS_SYSTEM_DIRECTORY_PLAN_CURRENT")}>
                          {overview.plan.name}
                        </DetailFact>
                        <DetailFact label={t("commerce:CREDITS_AVAILABLE_LABEL")} numeric>
                          {number.format(overview.credits.available)}
                        </DetailFact>
                        <DetailFact label={t("commerce:USAGE_REQUESTS")} numeric>
                          {number.format(overview.usage.requests)}
                        </DetailFact>
                      </dl>
                    </section>
                  ) : null}
                </ContentGuard>
              </TabsContent>

              <TabsContent value="members" className="mt-0 space-y-6">
                <section className="space-y-4">
                  <SectionHeading
                    icon={<Users className="size-4" />}
                    title={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_MEMBERS_PROJECTS_TITLE")}
                    description={t(
                      "settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_MEMBERS_PROJECTS_DESC",
                    )}
                  />
                  <dl className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-lg border p-4">
                      <DetailFact
                        label={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_ACTIVE_MEMBERS")}
                        numeric
                      >
                        {number.format(detail?.memberCount ?? props.workspace?.memberCount ?? 0)}
                      </DetailFact>
                    </div>
                    <div className="rounded-lg border p-4">
                      <DetailFact
                        label={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_PROJECT_TOTAL")}
                        numeric
                      >
                        {number.format(detail?.projectCount ?? props.workspace?.projectCount ?? 0)}
                      </DetailFact>
                    </div>
                  </dl>
                </section>

                <section className="space-y-4">
                  <SectionHeading
                    icon={<FolderKanban className="size-4" />}
                    title={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_RECENT_PROJECTS")}
                  />
                  <ContentGuard
                    loading={projectsQuery.isLoading}
                    error={projectsQuery.error}
                    empty={
                      !projectsQuery.isLoading &&
                      !projectsQuery.error &&
                      !projectsQuery.data?.items.length
                    }
                    onRetry={() => void projectsQuery.refetch()}
                    loadingVariant="table"
                    variant="compact"
                  >
                    <div className="divide-y rounded-lg border">
                      {(projectsQuery.data?.items ?? []).map((project) => (
                        <div key={project.projectId} className="flex items-center gap-3 px-4 py-3">
                          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-label-secondary">
                            <FolderKanban className="size-4" aria-hidden="true" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-footnote font-medium text-label-primary">
                              {project.name}
                            </div>
                            <div className="text-caption tabular-nums text-label-secondary">
                              {t(
                                "settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_PROJECT_MEMBER_COUNT",
                                {
                                  count: project.memberCount,
                                },
                              )}
                            </div>
                          </div>
                          <BaseTag color={project.isActive ? "green" : "red"}>
                            {t(
                              project.isActive
                                ? "settings:SETTINGS_SYSTEM_DIRECTORY_ACTIVE"
                                : "settings:SETTINGS_SYSTEM_DIRECTORY_STATUS_DISABLED",
                            )}
                          </BaseTag>
                        </div>
                      ))}
                    </div>
                  </ContentGuard>
                </section>
              </TabsContent>

              <TabsContent value="billing" className="mt-0 space-y-6">
                <ContentGuard
                  loading={commerceQuery.isLoading}
                  error={commerceQuery.error}
                  onRetry={() => void commerceQuery.refetch()}
                  loadingVariant="form"
                  variant="compact"
                >
                  {overview ? (
                    <>
                      <section className="space-y-4">
                        <div className="flex items-start justify-between gap-4">
                          <SectionHeading
                            icon={<CircleDollarSign className="size-4" />}
                            title={t(
                              "settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_PLAN_SUBSCRIPTION",
                            )}
                            description={overview.plan.description}
                          />
                          <Button size="sm" onClick={() => setPlanDialogOpen(true)}>
                            {t("settings:SETTINGS_SYSTEM_DIRECTORY_ACTION_ADJUST_PLAN")}
                          </Button>
                        </div>
                        <dl className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
                          <DetailFact label={t("settings:SETTINGS_SYSTEM_DIRECTORY_PLAN_CURRENT")}>
                            {overview.plan.name}
                          </DetailFact>
                          <DetailFact
                            label={t("settings:SETTINGS_SYSTEM_DIRECTORY_SUBSCRIPTION_STATUS")}
                          >
                            {t(statusLabelKey(overview.subscription.status))}
                          </DetailFact>
                          <DetailFact label={t("commerce:BILLING_INTERVAL")}>
                            {t(
                              overview.subscription.billingInterval === "yearly"
                                ? "commerce:BILLING_YEARLY"
                                : "commerce:BILLING_MONTHLY",
                            )}
                          </DetailFact>
                          <DetailFact
                            label={t("settings:SETTINGS_SYSTEM_DIRECTORY_PLAN_CANCELLATION")}
                          >
                            {t(
                              overview.subscription.cancelAtPeriodEnd
                                ? "settings:SETTINGS_SYSTEM_DIRECTORY_PLAN_CANCEL_AT_PERIOD_END"
                                : "settings:SETTINGS_SYSTEM_DIRECTORY_PLAN_CONTINUES",
                            )}
                          </DetailFact>
                          <DetailFact
                            label={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_PERIOD_START")}
                          >
                            {formatExactDateTime(overview.subscription.currentPeriodStart)}
                          </DetailFact>
                          <DetailFact
                            label={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_PERIOD_END")}
                          >
                            {formatExactDateTime(overview.subscription.currentPeriodEnd)}
                          </DetailFact>
                        </dl>
                      </section>

                      <Separator />

                      <section className="space-y-4">
                        <SectionHeading
                          icon={<Coins className="size-4" />}
                          title={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_CREDITS_TITLE")}
                          description={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_CREDITS_DESC")}
                        />
                        <div className="rounded-lg border p-4">
                          <div className="mb-3 flex items-center justify-between gap-3 text-footnote">
                            <span className="text-label-secondary">
                              {t("commerce:CREDITS_PERIOD_USAGE")}
                            </span>
                            <span className="font-semibold tabular-nums text-label-primary">
                              {number.format(overview.credits.periodSpent)} /{" "}
                              {number.format(overview.credits.periodGranted)}
                            </span>
                          </div>
                          <Progress
                            value={usagePercent(
                              overview.credits.periodSpent,
                              overview.credits.periodGranted,
                            )}
                            aria-label={t("commerce:CREDITS_PERIOD_USAGE")}
                          />
                          <dl className="mt-5 grid gap-4 sm:grid-cols-3">
                            <DetailFact label={t("commerce:CREDITS_BALANCE")} numeric>
                              {number.format(overview.credits.balance)}
                            </DetailFact>
                            <DetailFact label={t("commerce:CREDITS_RESERVED")} numeric>
                              {number.format(overview.credits.reserved)}
                            </DetailFact>
                            <DetailFact label={t("commerce:CREDITS_AVAILABLE_LABEL")} numeric>
                              {number.format(overview.credits.available)}
                            </DetailFact>
                          </dl>
                        </div>
                      </section>

                      <Separator />

                      <section className="space-y-4">
                        <SectionHeading
                          icon={<Gauge className="size-4" />}
                          title={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_USAGE_TITLE")}
                          description={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_USAGE_DESC", {
                            start: formatExactDateTime(overview.credits.periodStart),
                            end: formatExactDateTime(overview.credits.periodEnd),
                          })}
                        />
                        <dl className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2">
                          <div className="bg-card p-4">
                            <DetailFact label={t("commerce:USAGE_REQUESTS")} numeric>
                              {number.format(overview.usage.requests)}
                            </DetailFact>
                          </div>
                          <div className="bg-card p-4">
                            <DetailFact label={t("commerce:USAGE_ACTUAL_COST")} numeric>
                              {currency.format(overview.usage.periodCostMicros / 1_000_000)}
                            </DetailFact>
                          </div>
                          <div className="bg-card p-4">
                            <DetailFact
                              label={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_PROMPT_TOKENS")}
                              numeric
                            >
                              {number.format(overview.usage.promptTokens)}
                            </DetailFact>
                          </div>
                          <div className="bg-card p-4">
                            <DetailFact
                              label={t(
                                "settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_COMPLETION_TOKENS",
                              )}
                              numeric
                            >
                              {number.format(overview.usage.completionTokens)}
                            </DetailFact>
                          </div>
                        </dl>
                        <p className="text-caption leading-5 text-label-tertiary">
                          {t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_USAGE_COVERAGE")}
                        </p>
                      </section>

                      <Separator />

                      <section className="space-y-4">
                        <SectionHeading
                          icon={<RefreshCw className="size-4" />}
                          title={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_BILLING_SOURCE")}
                        />
                        <dl className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
                          <DetailFact
                            label={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_BILLING_PROVIDER")}
                          >
                            {overview.billingProvider === "disabled"
                              ? t("commerce:BILLING_PROVIDER_DISABLED")
                              : overview.billingProvider === "stripe"
                                ? "Stripe"
                                : overview.billingProvider}
                          </DetailFact>
                          <DetailFact
                            label={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_BILLING_MODE")}
                          >
                            {overview.billingMode === "external_checkout"
                              ? t("commerce:EXTERNAL_CHECKOUT_TITLE")
                              : overview.billingMode}
                          </DetailFact>
                        </dl>
                      </section>
                    </>
                  ) : null}
                </ContentGuard>
              </TabsContent>

              <TabsContent value="activity" className="mt-0 space-y-4">
                <SectionHeading
                  icon={<Activity className="size-4" />}
                  title={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_ACTIVITY_TITLE")}
                  description={t("settings:SETTINGS_SYSTEM_DIRECTORY_DETAILS_ACTIVITY_DESC")}
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
                            <div className="flex items-center justify-end gap-1 text-caption tabular-nums text-label-secondary">
                              <CalendarClock className="size-3" aria-hidden="true" />
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
            </DrawerBody>
          </Tabs>
        </DrawerContent>
      </Drawer>

      <WorkspacePlanAdjustmentDialog
        open={planDialogOpen}
        workspaceId={workspaceId}
        workspaceName={props.workspace?.name ?? null}
        overview={overview}
        onOpenChange={setPlanDialogOpen}
      />
    </>
  );
}
