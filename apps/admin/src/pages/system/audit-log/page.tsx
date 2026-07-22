import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { listSystemDirectoryProjects, listSystemDirectoryWorkspaces } from "@/api/system-directory";
import type {
  HTTPRequestGroupWithPercentiles,
  HTTPRequestRecord,
} from "@/api/platform-observability";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import { ActivityDetailDialog } from "@/pages/workspaces/shared/activity/components/activity-detail-dialog";
import {
  ChromeTabs,
  ChromeTabsContent,
  ChromeTabsList,
  ChromeTabsTrigger,
} from "@arclayer/ui/chrome-tabs";
import type {
  ActivityEvent,
  SystemDirectoryProject,
  SystemDirectoryWorkspace,
} from "@arclayer/openapi/admin-types";

import { useAuditDashboardWidgets } from "./dashboard-widgets";
import { RequestGroupDetailDialog } from "./request-group-detail-dialog";
import { RequestRecordDetailDialog } from "./request-record-detail-dialog";
import { ConfigurableDashboard } from "../observability/components/dashboard-layout";
import { ObservabilityPageControls } from "../observability/components/page-controls";
import type { ObservabilityPeriodDays } from "../observability/components/period-select";
import {
  useSystemObservabilityOverview,
  useSystemObservabilityTrend,
} from "../observability/hooks";

async function listAllSystemWorkspaces(): Promise<SystemDirectoryWorkspace[]> {
  const firstPage = await listSystemDirectoryWorkspaces({ page: 1, size: 100, ordering: "name" });
  const remainingPages = await Promise.all(
    Array.from({ length: Math.max(0, firstPage.pages - 1) }, (_, index) => index + 2).map((page) =>
      listSystemDirectoryWorkspaces({ page, size: 100, ordering: "name" }),
    ),
  );
  return [firstPage, ...remainingPages].flatMap((page) => page.items);
}

async function listAllSystemProjects(): Promise<SystemDirectoryProject[]> {
  const firstPage = await listSystemDirectoryProjects({ page: 1, size: 100, ordering: "name" });
  const remainingPages = await Promise.all(
    Array.from({ length: Math.max(0, firstPage.pages - 1) }, (_, index) => index + 2).map((page) =>
      listSystemDirectoryProjects({ page, size: 100, ordering: "name" }),
    ),
  );
  return [firstPage, ...remainingPages].flatMap((page) => page.items);
}

export function SystemAuditLogPage() {
  const { t } = useTranslation(["common", "activity", "platform"]);
  const [days, setDays] = useState<ObservabilityPeriodDays>(30);
  const [activeView, setActiveView] = useState("records");
  const [selected, setSelected] = useState<ActivityEvent | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<HTTPRequestRecord | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<HTTPRequestGroupWithPercentiles | null>(null);
  const overview = useSystemObservabilityOverview(days);
  const requestTrend = useSystemObservabilityTrend(days, "httpRequests");
  const errorTrend = useSystemObservabilityTrend(days, "httpErrors");
  const eventTrend = useSystemObservabilityTrend(days, "auditEvents");
  const workspacesQuery = useQuery({
    queryKey: ["system", "audit", "workspaces"] as const,
    queryFn: listAllSystemWorkspaces,
    retry: false,
    meta: { silent: true },
  });
  const projectsQuery = useQuery({
    queryKey: ["system", "audit", "projects"] as const,
    queryFn: listAllSystemProjects,
    retry: false,
    meta: { silent: true },
  });
  const queries = [overview, requestTrend, errorTrend, eventTrend, workspacesQuery, projectsQuery];
  const workspaceLabelById = useMemo(
    () =>
      Object.fromEntries(
        (workspacesQuery.data ?? []).map((workspace) => [workspace.workspaceId, workspace.name]),
      ),
    [workspacesQuery.data],
  );
  const projectLabelById = useMemo(
    () =>
      Object.fromEntries(
        (projectsQuery.data ?? []).map((project) => [project.projectId, project.name]),
      ),
    [projectsQuery.data],
  );
  const { recordWidgets, analysisWidgets, eventWidgets } = useAuditDashboardWidgets({
    days,
    overview,
    requestTrend,
    errorTrend,
    eventTrend,
    workspaceLabelById,
    projectLabelById,
    onSelectEvent: setSelected,
    onSelectRecord: setSelectedRecord,
    onSelectGroup: setSelectedGroup,
  });

  return (
    <DefaultPage
      title={t("platform:AUDIT_TITLE")}
      description={t("platform:AUDIT_DESCRIPTION")}
      contentClassName="min-h-0 flex flex-col"
      action={
        <ObservabilityPageControls
          days={days}
          onDaysChange={setDays}
          refreshing={queries.some((query) => query.isFetching)}
          onRefresh={() => void Promise.all(queries.map((query) => query.refetch()))}
        />
      }
    >
      <ContentGuard
        loading={overview.isLoading}
        error={overview.error}
        onRetry={() => void overview.refetch()}
        loadingVariant="form"
      >
        {overview.data ? (
          <ChromeTabs
            value={activeView}
            onValueChange={setActiveView}
            className="flex min-h-0 flex-1 flex-col gap-5 pb-8"
          >
            <ChromeTabsList
              widthMode="content"
              className="self-start"
              aria-label={t("platform:AUDIT_VIEW_LABEL")}
            >
              <ChromeTabsTrigger value="records">
                {t("platform:AUDIT_VIEW_REQUEST_RECORDS")}
              </ChromeTabsTrigger>
              <ChromeTabsTrigger value="analysis">
                {t("platform:AUDIT_VIEW_REQUEST_ANALYSIS")}
              </ChromeTabsTrigger>
              <ChromeTabsTrigger value="events">
                {t("platform:AUDIT_VIEW_EVENTS")}
              </ChromeTabsTrigger>
            </ChromeTabsList>

            <ChromeTabsContent value="records" className="mt-0 flex min-h-0 flex-col gap-5">
              <ConfigurableDashboard
                dashboardId="system-audit-log-records"
                widgets={recordWidgets}
                ariaLabel={t("platform:AUDIT_VIEW_REQUEST_RECORDS")}
              />
            </ChromeTabsContent>

            <ChromeTabsContent value="analysis" className="mt-0 flex min-h-0 flex-col gap-5">
              <ConfigurableDashboard
                dashboardId="system-audit-log-analysis"
                widgets={analysisWidgets}
                ariaLabel={t("platform:AUDIT_VIEW_REQUEST_ANALYSIS")}
              />
            </ChromeTabsContent>

            <ChromeTabsContent value="events" className="mt-0 flex min-h-0 flex-col gap-5">
              <ConfigurableDashboard
                dashboardId="system-audit-log-events"
                widgets={eventWidgets}
                ariaLabel={t("platform:AUDIT_VIEW_EVENTS")}
              />
            </ChromeTabsContent>
          </ChromeTabs>
        ) : null}
      </ContentGuard>

      <ActivityDetailDialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        event={selected}
        workspaceLabelById={workspaceLabelById}
      />
      <RequestRecordDetailDialog
        open={Boolean(selectedRecord)}
        onOpenChange={(open) => {
          if (!open) setSelectedRecord(null);
        }}
        record={selectedRecord}
        workspaceLabelById={workspaceLabelById}
        projectLabelById={projectLabelById}
      />
      <RequestGroupDetailDialog
        open={Boolean(selectedGroup)}
        onOpenChange={(open) => {
          if (!open) setSelectedGroup(null);
        }}
        group={selectedGroup}
      />
    </DefaultPage>
  );
}
