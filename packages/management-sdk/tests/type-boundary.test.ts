import { describe, expectTypeOf, it } from "vitest";

import type {
  ProjectSettingsDetail,
  ProjectSettingsPatch,
  PublishExportContractOut,
  PublishReadinessOut,
  ReleaseDryRunOut,
  ReleaseListOut,
} from "@arclayer/openapi";

import type { ManagementResult } from "../src";
import { createManagementSdk } from "../src";

type ManagementSdkPublic = ReturnType<typeof createManagementSdk>;

// @ts-expect-error management-sdk must not re-export backend boundary type aliases.
type RemovedProjectSettingsDetailAlias = import("../src").ProjectSettingsDetailContract;
// @ts-expect-error management-sdk must not re-export backend boundary type aliases.
type RemovedPublishPreviewAlias = import("../src").PublishPreviewContract;
void (0 as RemovedProjectSettingsDetailAlias | RemovedPublishPreviewAlias);

describe("management-sdk type boundary", () => {
  it("uses direct generated OpenAPI types on caller-facing methods", () => {
    expectTypeOf<
      Awaited<ReturnType<ManagementSdkPublic["site"]["getCoreSettings"]>>
    >().toEqualTypeOf<ManagementResult<ProjectSettingsDetail>>();
    expectTypeOf<
      Parameters<ManagementSdkPublic["site"]["patchCoreSettings"]>[0]["body"]
    >().toEqualTypeOf<ProjectSettingsPatch>();
    expectTypeOf<
      Awaited<ReturnType<ManagementSdkPublic["site"]["patchCoreSettings"]>>
    >().toEqualTypeOf<ManagementResult<ProjectSettingsDetail>>();
    expectTypeOf<Awaited<ReturnType<ManagementSdkPublic["releases"]["list"]>>>().toEqualTypeOf<
      ManagementResult<ReleaseListOut>
    >();
    expectTypeOf<Awaited<ReturnType<ManagementSdkPublic["releases"]["dryRun"]>>>().toEqualTypeOf<
      ManagementResult<ReleaseDryRunOut>
    >();
    expectTypeOf<
      Awaited<ReturnType<ManagementSdkPublic["releases"]["publishImpact"]>>
    >().toEqualTypeOf<ManagementResult<PublishReadinessOut>>();
    expectTypeOf<
      Awaited<ReturnType<ManagementSdkPublic["releases"]["publishPreviewContract"]>>
    >().toEqualTypeOf<ManagementResult<PublishExportContractOut>>();
  });
});
