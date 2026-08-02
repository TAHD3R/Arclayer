import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  hasAttentionFilters,
  operationalSignalQuery,
  parseNeedsAttentionSearch,
} from "@/operations/operations-routing";
import { getTrustedSupportingRouteDestination } from "@/capabilities/module-registry";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

describe("Needs attention URL and API contracts", () => {
  it("normalizes supported server filters and discards invalid URL values", () => {
    expect(
      parseNeedsAttentionSearch({
        sourceLifecycle: "resolved",
        coordinationState: "waiting",
        sourceDomain: "jobs",
        severity: "high",
        assigneeUserId: " operator-1 ",
        workspaceId: " workspace-1 ",
        scopeType: "workspace",
        includeReminded: "true",
        order: "detected_at",
        orderDirection: "desc",
        page: "3",
        signalId: " signal-1 ",
      }),
    ).toEqual({
      sourceLifecycle: "resolved",
      coordinationState: "waiting",
      sourceDomain: "jobs",
      severity: "high",
      assigneeUserId: "operator-1",
      workspaceId: "workspace-1",
      projectId: undefined,
      siteId: undefined,
      scopeType: "workspace",
      includeReminded: true,
      order: "detected_at",
      orderDirection: "desc",
      page: 3,
      signalId: "signal-1",
    });
    expect(
      parseNeedsAttentionSearch({
        sourceLifecycle: "closed",
        coordinationState: "dismissed",
        includeReminded: "sometimes",
        page: 0,
      }),
    ).toEqual({
      sourceLifecycle: undefined,
      coordinationState: undefined,
      sourceDomain: undefined,
      severity: undefined,
      assigneeUserId: undefined,
      workspaceId: undefined,
      projectId: undefined,
      siteId: undefined,
      scopeType: undefined,
      includeReminded: undefined,
      order: undefined,
      orderDirection: undefined,
      page: undefined,
      signalId: undefined,
    });
  });

  it("builds only the generated server-paginated query contract", () => {
    const search = parseNeedsAttentionSearch({
      sourceLifecycle: "all",
      coordinationState: "in_progress",
      sourceDomain: "jobs",
      severity: "high",
      assigneeUserId: "operator-1",
      projectId: "project-1",
      includeReminded: true,
      order: "detected_at",
      orderDirection: "desc",
      page: 2,
    });
    expect(operationalSignalQuery(search)).toEqual({
      sourceLifecycle: "all",
      coordinationState: "in_progress",
      sourceDomain: "jobs",
      severity: "high",
      assigneeUserId: "operator-1",
      workspaceId: undefined,
      projectId: "project-1",
      siteId: undefined,
      includeReminded: true,
      order: "detected_at",
      orderDirection: "desc",
      page: 2,
      size: 20,
    });
    expect(hasAttentionFilters(search)).toBe(true);
  });

  it("resolves source-owned investigation through the canonical Needs attention detail route", () => {
    expect(getTrustedSupportingRouteDestination("operations.jobs")).toMatchObject({
      path: "/attention/$signalId",
      routeTarget: "operations.jobs",
    });
    expect(
      getTrustedSupportingRouteDestination("https://attacker.invalid/operations/jobs"),
    ).toBeNull();
    expect(getTrustedSupportingRouteDestination("system.jobs")).toBeNull();
  });

  it("uses generated Operational Signal operations without legacy PublishJob or raw fetch", async () => {
    const source = await readFile(
      path.join(repositoryRoot, "apps/platform/src/operations/operations-api.ts"),
      "utf8",
    );
    expect(source).toContain('from "@arclayer/platform-openapi"');
    expect(source).toContain("platformListOperationalSignals");
    expect(source).toContain("platformGetOperationalSignal");
    expect(source).toContain("platformListOperationalSignalEligibleAssignees");
    expect(source).toContain("platformClaimOperationalSignal");
    expect(source).toContain("platformAssignOperationalSignal");
    expect(source).toContain("platformRemindOperationalSignalLater");
    expect(source).toContain("platformAddOperationalSignalNote");
    expect(source).not.toContain("platformListSystemJobs");
    expect(source).not.toContain("platformRetrySystemJob");
    expect(source).not.toContain("platformGetCurrentTeamIdentity");
    expect(source).not.toContain("fetch(");

    const detailRoute = await readFile(
      path.join(repositoryRoot, "apps/platform/src/routes/_authenticated/attention/$signalId.tsx"),
      "utf8",
    );
    expect(detailRoute).toContain('createFileRoute("/_authenticated/attention/$signalId")');
    expect(detailRoute).toContain("SignalDetailSheet");
    expect(detailRoute).not.toContain("/operations/jobs");
  });
});
