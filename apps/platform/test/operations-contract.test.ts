import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  hasAttentionFilters,
  jobIdFromDestination,
  operationalSignalQuery,
  parseNeedsAttentionSearch,
  parsePlatformJobsSearch,
} from "@/operations/operations-routing";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

describe("Needs attention URL and API contracts", () => {
  it("normalizes supported server filters and discards invalid URL values", () => {
    expect(
      parseNeedsAttentionSearch({
        sourceLifecycle: "resolved",
        coordinationState: "remind_later",
        includeReminded: "true",
        page: "3",
        signalId: " signal-1 ",
      }),
    ).toEqual({
      sourceLifecycle: "resolved",
      coordinationState: "remind_later",
      includeReminded: true,
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
      includeReminded: undefined,
      page: undefined,
      signalId: undefined,
    });
  });

  it("builds only the generated server-paginated query contract", () => {
    const search = parseNeedsAttentionSearch({
      sourceLifecycle: "all",
      coordinationState: "in_progress",
      includeReminded: true,
      page: 2,
    });
    expect(operationalSignalQuery(search)).toEqual({
      sourceLifecycle: "all",
      coordinationState: "in_progress",
      includeReminded: true,
      page: 2,
      size: 20,
    });
    expect(hasAttentionFilters(search)).toBe(true);
  });

  it("accepts only the canonical background-work investigation destination", () => {
    expect(jobIdFromDestination("/operations/jobs?jobId=job-1")).toBe("job-1");
    expect(jobIdFromDestination("https://attacker.invalid/operations/jobs?jobId=job-1")).toBeNull();
    expect(jobIdFromDestination("/system/jobs?jobId=job-1")).toBeNull();
    expect(parsePlatformJobsSearch({ jobId: " job-1 ", status: "failed" })).toEqual({
      jobId: "job-1",
    });
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
    expect(source).not.toContain("platformListSystemJobs");
    expect(source).not.toContain("platformRetrySystemJob");
    expect(source).not.toContain("platformGetCurrentTeamIdentity");
    expect(source).not.toContain("fetch(");

    const jobsPage = await readFile(
      path.join(repositoryRoot, "apps/platform/src/pages/platform-jobs.tsx"),
      "utf8",
    );
    expect(jobsPage).toContain("getOperationalSignal");
    expect(jobsPage).not.toContain("platformListSystemJobs");
    expect(jobsPage).not.toContain("platformRetrySystemJob");
    expect(jobsPage).not.toContain("Retry job");
  });
});
