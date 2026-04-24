import type { ApiPage, ApiRequestMetadata, ApiResult, MaybePromise } from "@arclayer/contracts";
import type { ApiClient } from "@arclayer/openapi";

export type { ApiEnvelope, MaybePromise, PagePayload } from "@arclayer/contracts";
export type {
  ApiKeyContract,
  ApiKeyCreateContract,
  ApiKeyListContract,
  AutomationCatalogContract,
  AutomationFlowContract,
  AutomationFlowCreateContract,
  AutomationFlowListContract,
  AutomationFlowPatchContract,
  AutomationRunContract,
  AutomationRunListContract,
  ContentItemBootstrapShapeContract,
  ContentItemContract,
  ContentItemCreateContract,
  ContentModelContract,
  ContentModelDefinitionContract,
  ContentModelDefinitionPatchContract,
  ContentModelImpactPreviewContract,
  ContentModelMutationContract,
  ContentVersionContract,
  ContentVersionDraftSaveContract,
  ContentVersionPatchContract,
  PersonalApiKeyCreateContract,
  PublishImpactContract,
  PublishPreviewContract,
  ProjectApiKeyCreateContract,
  ProjectRuntimeSiteContract,
  ProjectSettingsDetailContract,
  ProjectSettingsPatchContract,
  ReleaseContract,
  ReleaseDryRunContract,
  ReleaseListContract,
  ReleasePublishContract,
  ReleaseRollbackContract,
  RouteBindingContract,
  RouteBindingUpsertContract,
  SitePreviewTokenContract,
  SitePreviewTokenCreateContract,
} from "@arclayer/contracts";

export interface ManagementSdkOptions {
  baseUrl: string;
  token?: string | (() => MaybePromise<string | null | undefined>);
  headers?: HeadersInit;
  fetch?: typeof fetch;
}

export type ManagementRequestMetadata = ApiRequestMetadata;

export type ManagementResult<T> = ApiResult<T>;

export type ManagementPage<T> = ApiPage<T>;

export type ManagementRawClient = ApiClient;
