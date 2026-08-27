import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

async function source(relativePath: string): Promise<string> {
  return readFile(path.join(repositoryRoot, relativePath), "utf8");
}

describe("Platform Monitoring & Audit routes", () => {
  it("owns every focused Monitoring route including the overview route", async () => {
    const routeFiles = await Promise.all(
      ["requests", "performance", "ai-usage", "activity", "audit", "jobs"].map((name) =>
        source(`apps/platform/src/routes/_authenticated/monitoring/${name}.tsx`),
      ),
    );

    expect(routeFiles.join("\n")).toContain('"/_authenticated/monitoring/requests"');
    expect(routeFiles.join("\n")).toContain('"/_authenticated/monitoring/performance"');
    expect(routeFiles.join("\n")).toContain('"/_authenticated/monitoring/ai-usage"');
    expect(routeFiles.join("\n")).toContain('"/_authenticated/monitoring/activity"');
    expect(routeFiles.join("\n")).toContain('"/_authenticated/monitoring/audit"');
    expect(routeFiles.join("\n")).toContain('"/_authenticated/monitoring/jobs"');
    expect(routeFiles.join("\n")).toContain('"/_authenticated/monitoring/ai-usage"');
  });

  it("uses only generated Platform SDK monitoring operations", async () => {
    const [api, aiUsagePage] = await Promise.all([
      source("apps/platform/src/monitoring/monitoring-api.ts"),
      source("apps/platform/src/pages/monitoring-ai-usage.tsx"),
    ]);

    expect(api).toContain('from "@arclayer/platform-openapi"');
    expect(api).toContain("platformListPlatformHttpRequestRecords");
    expect(api).toContain("platformListPlatformHttpRequestGroups");
    expect(api).toContain("platformListPlatformAiUsageGroups");
    expect(api).toContain("platformListPlatformAiUsageRecords");
    expect(api).toContain("platformListActivity");
    expect(api).not.toContain("fetch(");
    expect(api).toContain("platformGetPlatformObservabilityOverview");
    expect(api).toContain("platformGetPlatformJobQueues");
    expect(api).toContain("platformListPlatformJobs");
    expect(api).toContain("platformGetPlatformJob");
    expect(aiUsagePage).toContain("AI_USAGE_RECORDS_TITLE");
    expect(aiUsagePage).toContain("dashboard.records.items");
  });

  it("anchors the background jobs page to the generated queue and attempt lifecycle", async () => {
    const [jobsPage, detailSheet, registry, route] = await Promise.all([
      source("apps/platform/src/pages/monitoring-jobs.tsx"),
      source("apps/platform/src/monitoring/job-detail-sheet.tsx"),
      source("apps/platform/src/capabilities/module-registry.ts"),
      source("apps/platform/src/routes/_authenticated/monitoring/jobs.tsx"),
    ]);

    expect(jobsPage).toContain("getJobQueues");
    expect(jobsPage).toContain("listJobs");
    expect(jobsPage).toContain("QueueCard");
    expect(detailSheet).toContain("getJobDetail");
    expect(detailSheet).toContain("detail.attempts.map");
    expect(registry).toContain('"monitoring.jobs"');
    expect(registry).toContain('labelKey: "navigation:MONITORING_JOBS"');
    expect(route).toContain("MonitoringJobsPage");
  });

  it("expands server-effective Audit saved views into typed Audit URL state only", async () => {
    const [auditRoute, auditPage, activityPage, savedViewsControl] = await Promise.all([
      source("apps/platform/src/routes/_authenticated/monitoring/audit.tsx"),
      source("apps/platform/src/pages/monitoring-audit.tsx"),
      source("apps/platform/src/pages/monitoring-activity.tsx"),
      source("apps/platform/src/saved-views/saved-views-control.tsx"),
    ]);

    expect(auditRoute).toContain("validateSearch");
    expect(auditRoute).toContain("eventName: text(value.eventName)");
    expect(auditRoute).toContain("occurredFrom: datetime(value.occurredFrom)");
    expect(auditRoute).toContain("workspaceId: publicId(value.workspaceId)");
    expect(auditRoute).toContain("ordering:");
    expect(auditRoute).toContain("page: page(value.page)");
    expect(auditPage).toContain("SAVED_VIEW_DEFINITIONS.monitoringAudit");
    expect(auditPage).toContain("<SavedViewsControl");
    expect(auditPage).toContain('savedStringFilter(state, "event_name")');
    expect(auditPage).toContain('savedStringFilter(state, "workspace_id")');
    expect(auditRoute).toContain(
      "onSearchChange={(next) => void navigate({ search: next, replace: true })}",
    );
    expect(savedViewsControl).toContain("if (!view.effective) return null");
    expect(savedViewsControl).toContain("expectedRevision: selected.view.revision");
    expect(savedViewsControl).toContain(
      "deleteSavedView(selected.view.id, selected.view.revision)",
    );
    expect(activityPage).not.toContain("SavedViewsControl");
  });
});
