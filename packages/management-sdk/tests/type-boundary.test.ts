import { describe, expectTypeOf, it } from "vitest";

import type {
  ContentModelDefinitionContract,
  ContentModelFieldContract,
  ContentModelFieldPatchContract,
  ContentModelFieldReorderContract,
  ContentModelFieldTypeRegistryOut,
  ContentItemCreateIn,
  ContentItemOut,
  ContentModelOut,
  ContentModelSchemaSnapshotOut,
  ContentComponentBindingListOut,
  ContentPresentationListOut,
  ContentSeoProfileOut,
  ContentVersionDraftSaveIn,
  ContentVersionOut,
  DomainBindingCreateIn,
  DomainBindingCreateOut,
  DomainBindingDeleteOut,
  DomainBindingOut,
  DomainBindingUpdateIn,
  DomainBindingVerifyOut,
  HierarchyNodeOut,
  HierarchyNodeUpsertIn,
  ProjectRuntimeSiteOut,
  ProjectSettingsDetail,
  ProjectSettingsPatch,
  ProjectSourceFileDeleteOut,
  ProjectSourceFileOut,
  ProjectSourceFileUpsertIn,
  ProjectSourceManifestOut,
  PublishExportContractOut,
  PublishReadinessOut,
  ReleaseDryRunOut,
  ReleaseListOut,
  ReleasePublishIn,
  ReleasePublishOut,
  RouteBindingOut,
  WorkspaceAiActionRequest,
  WorkspaceAiActionResponse,
} from "@arclayer/openapi";

import type {
  ManagementContentFieldsUpdate,
  ManagementContentFieldsUpdateInput,
  ManagementContentModelAiFieldMutation,
  ManagementContentModelAiUpdateInput,
  ManagementContentModelField,
  ManagementContentModelFieldScalar,
  ManagementEnterpriseLandingSiteCreateInput,
  ManagementEnterpriseLandingSiteCreateResult,
  ManagementEnterpriseLandingSiteSummary,
  ManagementEnterpriseLandingPageUpdate,
  ManagementEnterpriseLandingPageUpdateInput,
  ManagementPage,
  ManagementProjectAiActionRequest,
  ManagementProjectBootstrapSite,
  ManagementProjectBootstrapSiteInput,
  ManagementProjectContentModelAiUpdateInput,
  ManagementProjectContentFieldsUpdateInput,
  ManagementProjectHomepageDraft,
  ManagementProjectHomepageDraftInput,
  ManagementProjectHomepageLookupInput,
  ManagementProjectHomepageSnapshot,
  ManagementProjectHomepageUpdate,
  ManagementProjectHomepageUpdateInput,
  ManagementProjectOverview,
  ManagementProjectSdk,
  ManagementProjectSiteSettingsPatchInput,
  ManagementProjectSourceSettingsPatchInput,
  ManagementProjectSourceStructure,
  ManagementProjectSourcePatchOperation,
  ManagementProjectSourceTreeNode,
  ManagementReactViteLandingSourceInput,
  ManagementLandingSectionInput,
  ManagementReusableBlockModelContractInput,
  ManagementResult,
  ManagementWorkspaceActionComponentBinding,
  ManagementWorkspaceActionReleaseSummary,
  ManagementWorkspaceActionSiteStructure,
} from "../src";
import {
  buildManagementProjectSourceSettingsPatch,
  buildManagementProjectSiteSettingsPatch,
  buildManagementProjectSourceStructure,
  buildManagementProjectSourceTree,
  buildManagementReactViteLandingSource,
  buildManagementReusableBlockModelContract,
  createManagementSdk,
  readManagementContentModelFieldKeys,
  readManagementContentModelFields,
  readManagementWorkspaceActionReleaseSummary,
  readManagementWorkspaceActionSiteStructure,
} from "../src";

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
    expectTypeOf<
      Parameters<typeof buildManagementProjectSiteSettingsPatch>[0]
    >().toEqualTypeOf<ManagementProjectSiteSettingsPatchInput>();
    expectTypeOf<
      ReturnType<typeof buildManagementProjectSiteSettingsPatch>
    >().toEqualTypeOf<ProjectSettingsPatch>();
    expectTypeOf<
      Parameters<typeof buildManagementProjectSourceSettingsPatch>[0]
    >().toEqualTypeOf<ManagementProjectSourceSettingsPatchInput>();
    expectTypeOf<
      ReturnType<typeof buildManagementProjectSourceSettingsPatch>
    >().toEqualTypeOf<ProjectSettingsPatch>();
    expectTypeOf<Parameters<typeof buildManagementReusableBlockModelContract>[0]>().toEqualTypeOf<
      ManagementReusableBlockModelContractInput | undefined
    >();
    expectTypeOf<
      ReturnType<typeof buildManagementReusableBlockModelContract>
    >().toEqualTypeOf<ContentModelDefinitionContract>();
    expectTypeOf<
      Parameters<typeof readManagementContentModelFields>[0]
    >().toEqualTypeOf<ContentModelOut>();
    expectTypeOf<ReturnType<typeof readManagementContentModelFields>>().toEqualTypeOf<
      readonly ManagementContentModelField[]
    >();
    expectTypeOf<ReturnType<typeof readManagementContentModelFieldKeys>>().toEqualTypeOf<
      readonly string[]
    >();
    expectTypeOf<
      Parameters<typeof buildManagementReactViteLandingSource>[0]
    >().toEqualTypeOf<ManagementReactViteLandingSourceInput>();
    expectTypeOf<ManagementReactViteLandingSourceInput["sections"]>().toEqualTypeOf<
      readonly ManagementLandingSectionInput[] | undefined
    >();
    expectTypeOf<ReturnType<typeof buildManagementReactViteLandingSource>>().toEqualTypeOf<
      readonly ManagementProjectSourcePatchOperation[]
    >();
    expectTypeOf<Parameters<typeof buildManagementProjectSourceTree>[0]>().toEqualTypeOf<
      readonly ProjectSourceFileOut[]
    >();
    expectTypeOf<ReturnType<typeof buildManagementProjectSourceTree>>().toEqualTypeOf<
      readonly ManagementProjectSourceTreeNode[]
    >();
    expectTypeOf<
      Parameters<typeof buildManagementProjectSourceStructure>[0]
    >().toEqualTypeOf<ProjectSourceManifestOut>();
    expectTypeOf<
      ReturnType<typeof buildManagementProjectSourceStructure>
    >().toEqualTypeOf<ManagementProjectSourceStructure>();
    expectTypeOf<
      Parameters<ManagementSdkPublic["siteBuilder"]["createEnterpriseLandingSite"]>[0]
    >().toEqualTypeOf<ManagementEnterpriseLandingSiteCreateInput>();
    expectTypeOf<ManagementEnterpriseLandingSiteCreateInput["framework"]>().toEqualTypeOf<
      "astro" | "react_vite" | undefined
    >();
    expectTypeOf<
      Awaited<ReturnType<ManagementSdkPublic["siteBuilder"]["createEnterpriseLandingSite"]>>
    >().toEqualTypeOf<ManagementEnterpriseLandingSiteCreateResult>();
    expectTypeOf<ManagementEnterpriseLandingSiteCreateResult["domains"]>().toEqualTypeOf<
      ManagementPage<DomainBindingOut>
    >();
    expectTypeOf<ManagementEnterpriseLandingSiteCreateResult["contentModels"]>().toEqualTypeOf<
      ManagementPage<ContentModelOut>
    >();
    expectTypeOf<ManagementEnterpriseLandingSiteCreateResult["sourceStructure"]>().toEqualTypeOf<
      ManagementResult<ManagementProjectSourceStructure>
    >();
    expectTypeOf<ManagementEnterpriseLandingSiteCreateResult["sourceSettings"]>().toEqualTypeOf<
      ManagementResult<ProjectSettingsDetail>
    >();
    expectTypeOf<
      ManagementEnterpriseLandingSiteCreateResult["summary"]
    >().toEqualTypeOf<ManagementEnterpriseLandingSiteSummary>();
    expectTypeOf<ManagementEnterpriseLandingSiteSummary["releaseReady"]>().toEqualTypeOf<
      boolean | null
    >();
    expectTypeOf<
      Parameters<ManagementProjectSdk["site"]["updateEnterpriseLandingPage"]>[0]
    >().toEqualTypeOf<ManagementEnterpriseLandingPageUpdateInput | undefined>();
    expectTypeOf<
      Awaited<ReturnType<ManagementProjectSdk["site"]["updateEnterpriseLandingPage"]>>
    >().toEqualTypeOf<ManagementEnterpriseLandingPageUpdate>();
    expectTypeOf<ManagementEnterpriseLandingPageUpdate["sourceSettings"]>().toEqualTypeOf<
      ManagementResult<ProjectSettingsDetail> | undefined
    >();
    expectTypeOf<
      ManagementEnterpriseLandingSiteCreateResult["createProjectSiteStructure"]
    >().toEqualTypeOf<ManagementWorkspaceActionSiteStructure | null>();
    expectTypeOf<ManagementWorkspaceActionSiteStructure["componentBindings"]>().toEqualTypeOf<
      readonly ManagementWorkspaceActionComponentBinding[]
    >();
    expectTypeOf<
      ReturnType<typeof readManagementWorkspaceActionSiteStructure>
    >().toEqualTypeOf<ManagementWorkspaceActionSiteStructure | null>();
    expectTypeOf<
      ReturnType<typeof readManagementWorkspaceActionReleaseSummary>
    >().toEqualTypeOf<ManagementWorkspaceActionReleaseSummary | null>();
    expectTypeOf<
      ManagementEnterpriseLandingSiteCreateResult["primaryDomain"]
    >().toEqualTypeOf<DomainBindingOut | null>();
    expectTypeOf<Awaited<ReturnType<ManagementSdkPublic["releases"]["list"]>>>().toEqualTypeOf<
      ManagementResult<ReleaseListOut>
    >();
    expectTypeOf<Awaited<ReturnType<ManagementSdkPublic["releases"]["dryRun"]>>>().toEqualTypeOf<
      ManagementResult<ReleaseDryRunOut>
    >();
    expectTypeOf<Parameters<ManagementSdkPublic["releases"]["publish"]>[0]>().toEqualTypeOf<{
      body?: ReleasePublishIn | null;
      projectId: string;
    }>();
    expectTypeOf<Awaited<ReturnType<ManagementSdkPublic["releases"]["publish"]>>>().toEqualTypeOf<
      ManagementResult<ReleasePublishOut>
    >();
    expectTypeOf<
      Awaited<ReturnType<ManagementSdkPublic["releases"]["publishImpact"]>>
    >().toEqualTypeOf<ManagementResult<PublishReadinessOut>>();
    expectTypeOf<
      Awaited<ReturnType<ManagementSdkPublic["releases"]["publishPreviewContract"]>>
    >().toEqualTypeOf<ManagementResult<PublishExportContractOut>>();
    expectTypeOf<Awaited<ReturnType<ManagementSdkPublic["source"]["getManifest"]>>>().toEqualTypeOf<
      ManagementResult<ProjectSourceManifestOut>
    >();
    expectTypeOf<
      Awaited<ReturnType<ManagementSdkPublic["source"]["getStructure"]>>
    >().toEqualTypeOf<ManagementResult<ManagementProjectSourceStructure>>();
    expectTypeOf<Parameters<ManagementSdkPublic["source"]["readFile"]>[0]>().toEqualTypeOf<{
      filePath: string;
      projectId: string;
    }>();
    expectTypeOf<Awaited<ReturnType<ManagementSdkPublic["source"]["readFile"]>>>().toEqualTypeOf<
      ManagementResult<ProjectSourceFileOut>
    >();
    expectTypeOf<
      Parameters<ManagementSdkPublic["source"]["upsertFile"]>[0]["body"]
    >().toEqualTypeOf<ProjectSourceFileUpsertIn>();
    expectTypeOf<Parameters<ManagementSdkPublic["source"]["applyPatch"]>[0]>().toEqualTypeOf<{
      operations: readonly ManagementProjectSourcePatchOperation[];
      projectId: string;
    }>();
    expectTypeOf<Awaited<ReturnType<ManagementSdkPublic["source"]["applyPatch"]>>>().toEqualTypeOf<
      ManagementResult<ProjectSourceManifestOut>
    >();
    expectTypeOf<Parameters<ManagementSdkPublic["source"]["updateSettings"]>[0]>().toEqualTypeOf<
      ManagementProjectSourceSettingsPatchInput & { projectId: string }
    >();
    expectTypeOf<
      Awaited<ReturnType<ManagementSdkPublic["source"]["updateSettings"]>>
    >().toEqualTypeOf<ManagementResult<ProjectSettingsDetail>>();
    expectTypeOf<Awaited<ReturnType<ManagementSdkPublic["source"]["upsertFile"]>>>().toEqualTypeOf<
      ManagementResult<ProjectSourceFileOut>
    >();
    expectTypeOf<Awaited<ReturnType<ManagementSdkPublic["source"]["deleteFile"]>>>().toEqualTypeOf<
      ManagementResult<ProjectSourceFileDeleteOut>
    >();
    expectTypeOf<
      Awaited<ReturnType<ManagementSdkPublic["content"]["models"]["list"]>>
    >().toEqualTypeOf<ManagementPage<ContentModelOut>>();
    expectTypeOf<
      Awaited<ReturnType<ManagementSdkPublic["content"]["models"]["delete"]>>
    >().toEqualTypeOf<ManagementResult<null>>();
    expectTypeOf<
      Awaited<ReturnType<ManagementSdkPublic["content"]["items"]["list"]>>
    >().toEqualTypeOf<ManagementPage<ContentItemOut>>();
    expectTypeOf<
      Parameters<ManagementSdkPublic["content"]["items"]["create"]>[0]["body"]
    >().toEqualTypeOf<ContentItemCreateIn>();
    expectTypeOf<
      Awaited<ReturnType<ManagementSdkPublic["content"]["items"]["delete"]>>
    >().toEqualTypeOf<ManagementResult<ContentItemOut>>();
    expectTypeOf<
      Parameters<ManagementSdkPublic["content"]["items"]["saveDraft"]>[0]["body"]
    >().toEqualTypeOf<ContentVersionDraftSaveIn>();
    expectTypeOf<
      Awaited<ReturnType<ManagementSdkPublic["content"]["items"]["saveDraft"]>>
    >().toEqualTypeOf<ManagementResult<ContentVersionOut>>();
    expectTypeOf<
      Parameters<ManagementSdkPublic["content"]["items"]["updateFields"]>[0]
    >().toEqualTypeOf<ManagementContentFieldsUpdateInput>();
    expectTypeOf<
      Awaited<ReturnType<ManagementSdkPublic["content"]["items"]["updateFields"]>>
    >().toEqualTypeOf<ManagementContentFieldsUpdate>();
    expectTypeOf<
      Awaited<ReturnType<ManagementSdkPublic["content"]["items"]["publishVersion"]>>
    >().toEqualTypeOf<ManagementResult<ContentVersionOut>>();
    expectTypeOf<
      Awaited<ReturnType<ManagementSdkPublic["content"]["items"]["versions"]["publish"]>>
    >().toEqualTypeOf<ManagementResult<ContentVersionOut>>();
    expectTypeOf<
      Awaited<
        ReturnType<ManagementSdkPublic["content"]["items"]["versions"]["listComponentBindings"]>
      >
    >().toEqualTypeOf<ManagementResult<ContentComponentBindingListOut>>();
    expectTypeOf<
      Awaited<ReturnType<ManagementSdkPublic["content"]["items"]["versions"]["listPresentations"]>>
    >().toEqualTypeOf<ManagementResult<ContentPresentationListOut>>();
    expectTypeOf<
      Awaited<ReturnType<ManagementSdkPublic["content"]["items"]["versions"]["getSeoProfile"]>>
    >().toEqualTypeOf<ManagementResult<ContentSeoProfileOut>>();
    expectTypeOf<
      Parameters<ManagementSdkPublic["ai"]["executeWorkspaceAction"]>[0]["body"]
    >().toEqualTypeOf<WorkspaceAiActionRequest>();
    expectTypeOf<
      Awaited<ReturnType<ManagementSdkPublic["ai"]["executeWorkspaceAction"]>>
    >().toEqualTypeOf<ManagementResult<WorkspaceAiActionResponse>>();
    expectTypeOf<
      ReturnType<ManagementSdkPublic["forProject"]>
    >().toEqualTypeOf<ManagementProjectSdk>();
    expectTypeOf<
      Parameters<ManagementProjectSdk["ai"]["executeWorkspaceAction"]>[0]["body"]
    >().toEqualTypeOf<ManagementProjectAiActionRequest>();
    expectTypeOf<ManagementProjectAiActionRequest>().toMatchTypeOf<{
      message: string;
      workspaceId: string;
    }>();
    expectTypeOf<ManagementProjectAiActionRequest["projectId"]>().toEqualTypeOf<undefined>();
    expectTypeOf<ManagementContentModelFieldScalar>().toEqualTypeOf<
      "boolean" | "date_time" | "json" | "long_text" | "number" | "text"
    >();
    expectTypeOf<ManagementContentModelAiFieldMutation>().toMatchTypeOf<
      | { action: "add"; key: string; label: string; scalar: ManagementContentModelFieldScalar }
      | { action: "update"; key: string }
      | { action: "delete"; key: string }
    >();
    expectTypeOf<
      Parameters<ManagementSdkPublic["content"]["models"]["updateWithAi"]>[0]
    >().toEqualTypeOf<ManagementContentModelAiUpdateInput>();
    expectTypeOf<
      Awaited<ReturnType<ManagementSdkPublic["content"]["models"]["updateWithAi"]>>
    >().toEqualTypeOf<ManagementResult<WorkspaceAiActionResponse>>();
    expectTypeOf<
      Parameters<ManagementSdkPublic["content"]["models"]["fields"]["create"]>[0]["body"]
    >().toEqualTypeOf<ContentModelFieldContract>();
    expectTypeOf<
      Parameters<ManagementSdkPublic["content"]["models"]["fields"]["update"]>[0]["body"]
    >().toEqualTypeOf<ContentModelFieldPatchContract>();
    expectTypeOf<
      Parameters<ManagementSdkPublic["content"]["models"]["fields"]["reorder"]>[0]["body"]
    >().toEqualTypeOf<ContentModelFieldReorderContract>();
    expectTypeOf<
      Awaited<ReturnType<ManagementSdkPublic["content"]["models"]["fields"]["delete"]>>
    >().toEqualTypeOf<ManagementResult<ContentModelOut>>();
    expectTypeOf<
      Awaited<ReturnType<ManagementSdkPublic["content"]["models"]["listFieldTypes"]>>
    >().toEqualTypeOf<ManagementResult<ContentModelFieldTypeRegistryOut>>();
    expectTypeOf<
      Awaited<ReturnType<ManagementSdkPublic["content"]["models"]["getJsonPreview"]>>
    >().toEqualTypeOf<ManagementResult<ContentModelSchemaSnapshotOut>>();
    expectTypeOf<
      Parameters<ManagementProjectSdk["content"]["models"]["updateWithAi"]>[0]
    >().toEqualTypeOf<ManagementProjectContentModelAiUpdateInput>();
    expectTypeOf<
      Parameters<ManagementProjectSdk["content"]["models"]["fields"]["create"]>[0]
    >().toEqualTypeOf<{ body: ContentModelFieldContract; modelId: string }>();
    expectTypeOf<
      Parameters<ManagementProjectSdk["content"]["models"]["fields"]["update"]>[0]
    >().toEqualTypeOf<{
      body: ContentModelFieldPatchContract;
      fieldKey: string;
      modelId: string;
    }>();
    expectTypeOf<
      Parameters<ManagementProjectSdk["content"]["models"]["fields"]["reorder"]>[0]
    >().toEqualTypeOf<{ body: ContentModelFieldReorderContract; modelId: string }>();
    expectTypeOf<
      Parameters<ManagementProjectSdk["content"]["models"]["fields"]["delete"]>[0]
    >().toEqualTypeOf<{ fieldKey: string; modelId: string }>();
    expectTypeOf<
      Awaited<ReturnType<ManagementProjectSdk["content"]["items"]["versions"]["listPresentations"]>>
    >().toEqualTypeOf<ManagementResult<ContentPresentationListOut>>();
    expectTypeOf<
      Awaited<
        ReturnType<ManagementProjectSdk["content"]["items"]["versions"]["listComponentBindings"]>
      >
    >().toEqualTypeOf<ManagementResult<ContentComponentBindingListOut>>();
    expectTypeOf<
      Awaited<ReturnType<ManagementProjectSdk["content"]["items"]["versions"]["getSeoProfile"]>>
    >().toEqualTypeOf<ManagementResult<ContentSeoProfileOut>>();
    expectTypeOf<
      Awaited<ReturnType<ManagementProjectSdk["content"]["routing"]["listHierarchyNodes"]>>
    >().toEqualTypeOf<ManagementResult<HierarchyNodeOut[]>>();
    expectTypeOf<
      Parameters<ManagementProjectSdk["content"]["routing"]["upsertHierarchyNode"]>[0]
    >().toEqualTypeOf<{ body: HierarchyNodeUpsertIn; itemId: string }>();
    expectTypeOf<
      Awaited<ReturnType<ManagementSdkPublic["content"]["routing"]["listHierarchyNodes"]>>
    >().toEqualTypeOf<ManagementResult<HierarchyNodeOut[]>>();
    expectTypeOf<
      Parameters<ManagementSdkPublic["content"]["routing"]["upsertHierarchyNode"]>[0]
    >().toEqualTypeOf<{ body: HierarchyNodeUpsertIn; itemId: string; projectId: string }>();
    expectTypeOf<
      Awaited<ReturnType<ManagementProjectSdk["content"]["models"]["listFieldTypes"]>>
    >().toEqualTypeOf<ManagementResult<ContentModelFieldTypeRegistryOut>>();
    expectTypeOf<
      Awaited<ReturnType<ManagementProjectSdk["content"]["models"]["getJsonPreview"]>>
    >().toEqualTypeOf<ManagementResult<ContentModelSchemaSnapshotOut>>();
    expectTypeOf<
      Awaited<ReturnType<ManagementProjectSdk["ai"]["executeWorkspaceAction"]>>
    >().toEqualTypeOf<ManagementResult<WorkspaceAiActionResponse>>();
    expectTypeOf<
      Awaited<ReturnType<ManagementProjectSdk["getOverview"]>>
    >().toEqualTypeOf<ManagementProjectOverview>();
    expectTypeOf<ManagementProjectOverview["site"]>().toEqualTypeOf<
      ManagementResult<ProjectRuntimeSiteOut>
    >();
    expectTypeOf<ManagementProjectOverview["coreSettings"]>().toEqualTypeOf<
      ManagementResult<ProjectSettingsDetail>
    >();
    expectTypeOf<ManagementProjectOverview["sourceManifest"]>().toEqualTypeOf<
      ManagementResult<ProjectSourceManifestOut>
    >();
    expectTypeOf<ManagementProjectOverview["sourceStructure"]>().toEqualTypeOf<
      ManagementResult<ManagementProjectSourceStructure>
    >();
    expectTypeOf<ManagementProjectOverview["releases"]>().toEqualTypeOf<
      ManagementResult<ReleaseListOut>
    >();
    expectTypeOf<Parameters<ManagementProjectSdk["source"]["upsertFile"]>[0]>().toEqualTypeOf<{
      body: ProjectSourceFileUpsertIn;
      filePath: string;
    }>();
    expectTypeOf<Parameters<ManagementProjectSdk["source"]["applyPatch"]>[0]>().toEqualTypeOf<{
      operations: readonly ManagementProjectSourcePatchOperation[];
    }>();
    expectTypeOf<ManagementProjectSourcePatchOperation>().toEqualTypeOf<
      | {
          readonly body: ProjectSourceFileUpsertIn;
          readonly filePath: string;
          readonly kind: "upsert";
        }
      | {
          readonly filePath: string;
          readonly kind: "delete";
        }
    >();
    expectTypeOf<Awaited<ReturnType<ManagementProjectSdk["source"]["applyPatch"]>>>().toEqualTypeOf<
      ManagementResult<ProjectSourceManifestOut>
    >();
    expectTypeOf<
      Parameters<ManagementProjectSdk["source"]["updateSettings"]>[0]
    >().toEqualTypeOf<ManagementProjectSourceSettingsPatchInput>();
    expectTypeOf<
      Awaited<ReturnType<ManagementProjectSdk["source"]["updateSettings"]>>
    >().toEqualTypeOf<ManagementResult<ProjectSettingsDetail>>();
    expectTypeOf<
      Awaited<ReturnType<ManagementProjectSdk["source"]["getManifest"]>>
    >().toEqualTypeOf<ManagementResult<ProjectSourceManifestOut>>();
    expectTypeOf<
      Awaited<ReturnType<ManagementProjectSdk["source"]["getStructure"]>>
    >().toEqualTypeOf<ManagementResult<ManagementProjectSourceStructure>>();
    expectTypeOf<Parameters<ManagementProjectSdk["source"]["readFile"]>[0]>().toEqualTypeOf<{
      filePath: string;
    }>();
    expectTypeOf<Awaited<ReturnType<ManagementProjectSdk["source"]["readFile"]>>>().toEqualTypeOf<
      ManagementResult<ProjectSourceFileOut>
    >();
    expectTypeOf<
      Parameters<ManagementProjectSdk["content"]["items"]["create"]>[0]["body"]
    >().toEqualTypeOf<ContentItemCreateIn>();
    expectTypeOf<
      Awaited<ReturnType<ManagementProjectSdk["content"]["items"]["list"]>>
    >().toEqualTypeOf<ManagementPage<ContentItemOut>>();
    expectTypeOf<
      Parameters<ManagementProjectSdk["content"]["items"]["saveDraft"]>[0]["body"]
    >().toEqualTypeOf<ContentVersionDraftSaveIn>();
    expectTypeOf<
      Parameters<ManagementProjectSdk["content"]["items"]["updateFields"]>[0]
    >().toEqualTypeOf<ManagementProjectContentFieldsUpdateInput>();
    expectTypeOf<
      Awaited<ReturnType<ManagementProjectSdk["content"]["items"]["updateFields"]>>
    >().toEqualTypeOf<ManagementContentFieldsUpdate>();
    expectTypeOf<Awaited<ReturnType<ManagementProjectSdk["releases"]["dryRun"]>>>().toEqualTypeOf<
      ManagementResult<ReleaseDryRunOut>
    >();
    expectTypeOf<Parameters<ManagementProjectSdk["releases"]["publish"]>[0]>().toEqualTypeOf<
      { body?: ReleasePublishIn | null } | undefined
    >();
    expectTypeOf<Awaited<ReturnType<ManagementProjectSdk["releases"]["publish"]>>>().toEqualTypeOf<
      ManagementResult<ReleasePublishOut>
    >();
    expectTypeOf<
      Awaited<ReturnType<ManagementProjectSdk["site"]["getCoreSettings"]>>
    >().toEqualTypeOf<ManagementResult<ProjectSettingsDetail>>();
    expectTypeOf<
      Parameters<ManagementProjectSdk["site"]["createHomepageDraft"]>[0]
    >().toEqualTypeOf<ManagementProjectHomepageDraftInput | undefined>();
    expectTypeOf<
      Awaited<ReturnType<ManagementProjectSdk["site"]["createHomepageDraft"]>>
    >().toEqualTypeOf<ManagementProjectHomepageDraft>();
    expectTypeOf<Parameters<ManagementProjectSdk["site"]["findHomepage"]>[0]>().toEqualTypeOf<
      ManagementProjectHomepageLookupInput | undefined
    >();
    expectTypeOf<
      Awaited<ReturnType<ManagementProjectSdk["site"]["findHomepage"]>>
    >().toEqualTypeOf<ManagementProjectHomepageSnapshot | null>();
    expectTypeOf<
      Parameters<ManagementProjectSdk["site"]["updateHomepageDraft"]>[0]
    >().toEqualTypeOf<ManagementProjectHomepageUpdateInput | undefined>();
    expectTypeOf<
      Awaited<ReturnType<ManagementProjectSdk["site"]["updateHomepageDraft"]>>
    >().toEqualTypeOf<ManagementProjectHomepageUpdate>();
    expectTypeOf<Parameters<ManagementProjectSdk["site"]["bootstrapSite"]>[0]>().toEqualTypeOf<
      ManagementProjectBootstrapSiteInput | undefined
    >();
    expectTypeOf<
      Awaited<ReturnType<ManagementProjectSdk["site"]["bootstrapSite"]>>
    >().toEqualTypeOf<ManagementProjectBootstrapSite>();
    expectTypeOf<ManagementProjectBootstrapSite["routeBindings"]>().toEqualTypeOf<
      ManagementResult<RouteBindingOut[]>
    >();
    expectTypeOf<ManagementProjectBootstrapSite["hierarchyNodes"]>().toEqualTypeOf<
      ManagementResult<HierarchyNodeOut[]>
    >();
    expectTypeOf<ManagementProjectBootstrapSite["homepageComponentBindings"]>().toEqualTypeOf<
      ManagementResult<ContentComponentBindingListOut>
    >();
    expectTypeOf<ManagementProjectOverview["domains"]>().toEqualTypeOf<
      ManagementPage<DomainBindingOut>
    >();
    expectTypeOf<Parameters<ManagementProjectSdk["domains"]["list"]>[0]>().toEqualTypeOf<
      { page?: number; size?: number } | undefined
    >();
    expectTypeOf<Parameters<ManagementProjectSdk["domains"]["create"]>[0]>().toEqualTypeOf<{
      body: DomainBindingCreateIn;
    }>();
    expectTypeOf<Awaited<ReturnType<ManagementProjectSdk["domains"]["create"]>>>().toEqualTypeOf<
      ManagementResult<DomainBindingCreateOut>
    >();
    expectTypeOf<Parameters<ManagementProjectSdk["domains"]["update"]>[0]>().toEqualTypeOf<{
      bindingId: string;
      body: DomainBindingUpdateIn;
    }>();
    expectTypeOf<Awaited<ReturnType<ManagementProjectSdk["domains"]["update"]>>>().toEqualTypeOf<
      ManagementResult<DomainBindingOut>
    >();
    expectTypeOf<Awaited<ReturnType<ManagementProjectSdk["domains"]["verify"]>>>().toEqualTypeOf<
      ManagementResult<DomainBindingVerifyOut>
    >();
    expectTypeOf<Awaited<ReturnType<ManagementProjectSdk["domains"]["delete"]>>>().toEqualTypeOf<
      ManagementResult<DomainBindingDeleteOut>
    >();
  });
});
