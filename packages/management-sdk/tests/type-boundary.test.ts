import { describe, expectTypeOf, it } from "vitest";

import type {
  ManagementResult,
  ProjectSettingsDetailContract,
  ProjectSettingsPatchContract,
  PublishImpactContract,
  PublishPreviewContract,
  ReleaseDryRunContract,
  ReleaseListContract,
} from "../src";
import { createManagementSdk } from "../src";

type ManagementSdkPublic = ReturnType<typeof createManagementSdk>;

// @ts-expect-error management-sdk public surface must expose contract alias names.
type RawProjectSettingsDetailExport = import("../src").ProjectSettingsDetail;
// @ts-expect-error management-sdk public surface must expose contract alias names.
type RawProjectSettingsPatchExport = import("../src").ProjectSettingsPatch;
void (0 as RawProjectSettingsDetailExport | RawProjectSettingsPatchExport);

describe("management-sdk type boundary", () => {
  it("keeps contract aliases on caller-facing methods", () => {
    expectTypeOf<
      Awaited<ReturnType<ManagementSdkPublic["site"]["getCoreSettings"]>>
    >().toEqualTypeOf<ManagementResult<ProjectSettingsDetailContract>>();
    expectTypeOf<
      Parameters<ManagementSdkPublic["site"]["patchCoreSettings"]>[0]["body"]
    >().toEqualTypeOf<ProjectSettingsPatchContract>();
    expectTypeOf<
      Awaited<ReturnType<ManagementSdkPublic["site"]["patchCoreSettings"]>>
    >().toEqualTypeOf<ManagementResult<ProjectSettingsDetailContract>>();
    expectTypeOf<Awaited<ReturnType<ManagementSdkPublic["releases"]["list"]>>>().toEqualTypeOf<
      ManagementResult<ReleaseListContract>
    >();
    expectTypeOf<Awaited<ReturnType<ManagementSdkPublic["releases"]["dryRun"]>>>().toEqualTypeOf<
      ManagementResult<ReleaseDryRunContract>
    >();
    expectTypeOf<
      Awaited<ReturnType<ManagementSdkPublic["releases"]["publishImpact"]>>
    >().toEqualTypeOf<ManagementResult<PublishImpactContract>>();
    expectTypeOf<
      Awaited<ReturnType<ManagementSdkPublic["releases"]["publishPreviewContract"]>>
    >().toEqualTypeOf<ManagementResult<PublishPreviewContract>>();
  });
});
