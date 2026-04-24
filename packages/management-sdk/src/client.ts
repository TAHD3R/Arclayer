import * as openapi from "@arclayer/openapi";
import type {
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

import type {
  ApiEnvelope,
  ManagementPage,
  ManagementRawClient,
  ManagementResult,
  ManagementSdkOptions,
  PagePayload,
} from "./types";
import {
  createManagementHeaders,
  normalizeManagementBaseUrl,
  normalizeManagementPage,
  normalizeManagementResult,
} from "./helpers";

type OpenApiResponse<T> = {
  data?: ApiEnvelope<T>;
  error?: unknown;
  request: Request;
  response: Response;
};

type OpenApiOperation<T> = (options: Record<string, unknown>) => Promise<OpenApiResponse<T>>;

export interface ManagementSdk {
  readonly automation: {
    createFlow(input: {
      body: AutomationFlowCreateContract;
      projectId: string;
    }): Promise<ManagementResult<AutomationFlowContract>>;
    deleteFlow(input: { flowId: string; projectId: string }): Promise<ManagementResult<null>>;
    getCatalog(input: { projectId: string }): Promise<ManagementResult<AutomationCatalogContract>>;
    getRun(input: {
      projectId: string;
      runId: string;
    }): Promise<ManagementResult<AutomationRunContract>>;
    listFlows(input: { projectId: string }): Promise<ManagementResult<AutomationFlowListContract>>;
    listRuns(input: {
      limit?: number;
      projectId: string;
    }): Promise<ManagementResult<AutomationRunListContract>>;
    updateFlow(input: {
      body: AutomationFlowPatchContract;
      flowId: string;
      projectId: string;
    }): Promise<ManagementResult<AutomationFlowContract>>;
  };
  readonly apiKeys: {
    readonly personal: {
      create(input: {
        body: PersonalApiKeyCreateContract;
      }): Promise<ManagementResult<ApiKeyCreateContract>>;
      get(input: { keyId: string }): Promise<ManagementResult<ApiKeyContract>>;
      list(): Promise<ManagementResult<ApiKeyListContract>>;
      revoke(input: { keyId: string }): Promise<ManagementResult<ApiKeyContract>>;
      rotate(input: { keyId: string }): Promise<ManagementResult<ApiKeyCreateContract>>;
    };
    readonly project: {
      create(input: {
        body: ProjectApiKeyCreateContract;
        projectId: string;
      }): Promise<ManagementResult<ApiKeyCreateContract>>;
      get(input: { keyId: string; projectId: string }): Promise<ManagementResult<ApiKeyContract>>;
      list(input: { projectId: string }): Promise<ManagementResult<ApiKeyListContract>>;
      revoke(input: {
        keyId: string;
        projectId: string;
      }): Promise<ManagementResult<ApiKeyContract>>;
      rotate(input: {
        keyId: string;
        projectId: string;
      }): Promise<ManagementResult<ApiKeyCreateContract>>;
    };
  };
  readonly content: {
    readonly items: {
      applyBootstrapShape(input: {
        body: ContentItemBootstrapShapeContract;
        itemId: string;
        projectId: string;
      }): Promise<ManagementResult<ContentItemContract>>;
      archive(input: {
        itemId: string;
        projectId: string;
      }): Promise<ManagementResult<ContentItemContract>>;
      create(input: {
        body: ContentItemCreateContract;
        projectId: string;
      }): Promise<ManagementResult<ContentItemContract>>;
      delete(input: {
        itemId: string;
        projectId: string;
      }): Promise<ManagementResult<ContentItemContract>>;
      duplicate(input: {
        itemId: string;
        projectId: string;
      }): Promise<ManagementResult<ContentItemContract>>;
      get(input: {
        itemId: string;
        projectId: string;
      }): Promise<ManagementResult<ContentItemContract>>;
      list(input: {
        modelKey?: string | null;
        page?: number;
        projectId: string;
        size?: number;
      }): Promise<ManagementPage<ContentItemContract>>;
      readonly versions: {
        get(input: {
          itemId: string;
          projectId: string;
          versionNumber: number;
        }): Promise<ManagementResult<ContentVersionContract>>;
        list(input: {
          itemId: string;
          projectId: string;
        }): Promise<ManagementPage<ContentVersionContract>>;
        patch(input: {
          body: ContentVersionPatchContract;
          itemId: string;
          projectId: string;
          versionNumber: number;
        }): Promise<ManagementResult<ContentVersionContract>>;
        publish(input: {
          body?: Record<string, never>;
          itemId: string;
          projectId: string;
          versionNumber: number;
        }): Promise<ManagementResult<ContentVersionContract>>;
        saveDraft(input: {
          body: ContentVersionDraftSaveContract;
          itemId: string;
          projectId: string;
        }): Promise<ManagementResult<ContentVersionContract>>;
      };
      unarchive(input: {
        itemId: string;
        projectId: string;
      }): Promise<ManagementResult<ContentItemContract>>;
    };
    readonly models: {
      create(input: {
        body: ContentModelDefinitionContract;
        projectId: string;
      }): Promise<ManagementResult<ContentModelMutationContract>>;
      list(input: {
        page?: number;
        projectId: string;
        size?: number;
      }): Promise<ManagementPage<ContentModelContract>>;
      previewUpdate(input: {
        body: ContentModelDefinitionPatchContract;
        modelId: string;
        projectId: string;
      }): Promise<ManagementResult<ContentModelImpactPreviewContract>>;
      update(input: {
        body: ContentModelDefinitionPatchContract;
        modelId: string;
        projectId: string;
      }): Promise<ManagementResult<ContentModelMutationContract>>;
    };
    readonly routing: {
      listBindings(input: { projectId: string }): Promise<ManagementResult<RouteBindingContract[]>>;
      upsertBinding(input: {
        body: RouteBindingUpsertContract;
        itemId: string;
        projectId: string;
      }): Promise<ManagementResult<RouteBindingContract>>;
    };
  };
  readonly rawClient: ManagementRawClient;
  readonly releases: {
    dryRun(input: { projectId: string }): Promise<ManagementResult<ReleaseDryRunContract>>;
    get(input: {
      projectId: string;
      releaseId: string;
    }): Promise<ManagementResult<ReleaseContract>>;
    list(input: { projectId: string }): Promise<ManagementResult<ReleaseListContract>>;
    publishImpact(input: { projectId: string }): Promise<ManagementResult<PublishImpactContract>>;
    publishPreviewContract(input: {
      projectId: string;
    }): Promise<ManagementResult<PublishPreviewContract>>;
    publish(input: { projectId: string }): Promise<ManagementResult<ReleasePublishContract>>;
    rollback(input: {
      projectId: string;
      releaseId: string;
    }): Promise<ManagementResult<ReleaseRollbackContract>>;
  };
  readonly site: {
    createPreviewToken(input: {
      body: SitePreviewTokenCreateContract;
      projectId: string;
    }): Promise<ManagementResult<SitePreviewTokenContract>>;
    get(input: { projectId: string }): Promise<ManagementResult<ProjectRuntimeSiteContract>>;
    getCoreSettings(input: {
      projectId: string;
    }): Promise<ManagementResult<ProjectSettingsDetailContract>>;
    patchCoreSettings(input: {
      body: ProjectSettingsPatchContract;
      projectId: string;
    }): Promise<ManagementResult<ProjectSettingsDetailContract>>;
  };
}

export const createManagementSdk = (options: ManagementSdkOptions): ManagementSdk => {
  const rawClient = openapi.createApiClient({
    baseUrl: normalizeManagementBaseUrl(options.baseUrl),
    fetch: options.fetch,
  });

  const invoke = async <T>(
    operation: OpenApiOperation<T>,
    request: Record<string, unknown>,
  ): Promise<ManagementResult<T>> => {
    const headers = await createManagementHeaders(
      options,
      request.headers as HeadersInit | undefined,
    );
    const result = await operation({
      ...request,
      client: rawClient,
      headers,
      responseStyle: "fields",
    });
    return normalizeManagementResult<T>(result.response, result.data ?? result.error);
  };

  const invokePage = async <TItem, TPage extends PagePayload<TItem>>(
    operation: OpenApiOperation<TPage>,
    request: Record<string, unknown>,
  ): Promise<ManagementPage<TItem>> => {
    const headers = await createManagementHeaders(
      options,
      request.headers as HeadersInit | undefined,
    );
    const result = await operation({
      ...request,
      client: rawClient,
      headers,
      responseStyle: "fields",
    });
    return normalizeManagementPage<TItem>(result.response, result.data ?? result.error);
  };

  return {
    rawClient,
    automation: {
      getCatalog: ({ projectId }) =>
        invoke<openapi.AutomationCatalogOut>(
          openapi.domainProjectsListProjectAutomationCatalog as OpenApiOperation<openapi.AutomationCatalogOut>,
          { path: { project_id: projectId } },
        ),
      listFlows: ({ projectId }) =>
        invoke<openapi.AutomationFlowListOut>(
          openapi.domainProjectsListProjectAutomationFlows as OpenApiOperation<openapi.AutomationFlowListOut>,
          { path: { project_id: projectId } },
        ),
      createFlow: ({ projectId, body }) =>
        invoke<openapi.AutomationFlowOut>(
          openapi.domainProjectsCreateProjectAutomationFlow as OpenApiOperation<openapi.AutomationFlowOut>,
          { body, path: { project_id: projectId } },
        ),
      updateFlow: ({ projectId, flowId, body }) =>
        invoke<openapi.AutomationFlowOut>(
          openapi.domainProjectsUpdateProjectAutomationFlow as OpenApiOperation<openapi.AutomationFlowOut>,
          { body, path: { flow_id: flowId, project_id: projectId } },
        ),
      deleteFlow: ({ projectId, flowId }) =>
        invoke<null>(openapi.domainProjectsDeleteProjectAutomationFlow as OpenApiOperation<null>, {
          path: { flow_id: flowId, project_id: projectId },
        }),
      listRuns: ({ projectId, limit }) =>
        invoke<openapi.AutomationRunListOut>(
          openapi.domainProjectsListProjectAutomationRuns as OpenApiOperation<openapi.AutomationRunListOut>,
          { path: { project_id: projectId }, query: { limit } },
        ),
      getRun: ({ projectId, runId }) =>
        invoke<openapi.AutomationRunOut>(
          openapi.domainProjectsGetProjectAutomationRun as OpenApiOperation<openapi.AutomationRunOut>,
          { path: { project_id: projectId, run_id: runId } },
        ),
    },
    apiKeys: {
      personal: {
        list: () =>
          invoke<openapi.ApiKeyListOut>(
            openapi.domainWorkspacesListPersonalApiKeys as OpenApiOperation<openapi.ApiKeyListOut>,
            {},
          ),
        create: ({ body }) =>
          invoke<openapi.ApiKeyCreateOut>(
            openapi.domainWorkspacesCreatePersonalApiKey as OpenApiOperation<openapi.ApiKeyCreateOut>,
            { body },
          ),
        get: ({ keyId }) =>
          invoke<openapi.ApiKeyOut>(
            openapi.domainWorkspacesGetPersonalApiKey as OpenApiOperation<openapi.ApiKeyOut>,
            { path: { key_id: keyId } },
          ),
        revoke: ({ keyId }) =>
          invoke<openapi.ApiKeyOut>(
            openapi.domainWorkspacesRevokePersonalApiKey as OpenApiOperation<openapi.ApiKeyOut>,
            { path: { key_id: keyId } },
          ),
        rotate: ({ keyId }) =>
          invoke<openapi.ApiKeyCreateOut>(
            openapi.domainWorkspacesRotatePersonalApiKey as OpenApiOperation<openapi.ApiKeyCreateOut>,
            { path: { key_id: keyId } },
          ),
      },
      project: {
        list: ({ projectId }) =>
          invoke<openapi.ApiKeyListOut>(
            openapi.domainProjectsListProjectApiKeys as OpenApiOperation<openapi.ApiKeyListOut>,
            { path: { project_id: projectId } },
          ),
        create: ({ projectId, body }) =>
          invoke<openapi.ApiKeyCreateOut>(
            openapi.domainProjectsCreateProjectApiKey as OpenApiOperation<openapi.ApiKeyCreateOut>,
            { body, path: { project_id: projectId } },
          ),
        get: ({ projectId, keyId }) =>
          invoke<openapi.ApiKeyOut>(
            openapi.domainProjectsGetProjectApiKey as OpenApiOperation<openapi.ApiKeyOut>,
            { path: { key_id: keyId, project_id: projectId } },
          ),
        revoke: ({ projectId, keyId }) =>
          invoke<openapi.ApiKeyOut>(
            openapi.domainProjectsRevokeProjectApiKey as OpenApiOperation<openapi.ApiKeyOut>,
            { path: { key_id: keyId, project_id: projectId } },
          ),
        rotate: ({ projectId, keyId }) =>
          invoke<openapi.ApiKeyCreateOut>(
            openapi.domainProjectsRotateProjectApiKey as OpenApiOperation<openapi.ApiKeyCreateOut>,
            { path: { key_id: keyId, project_id: projectId } },
          ),
      },
    },
    content: {
      items: {
        list: ({ projectId, modelKey, page, size }) =>
          invokePage<openapi.ContentItemOut, PagePayload<openapi.ContentItemOut>>(
            openapi.domainProjectsListProjectContentItems as OpenApiOperation<
              PagePayload<openapi.ContentItemOut>
            >,
            {
              path: { project_id: projectId },
              query: { modelKey, page, size },
            },
          ),
        create: ({ projectId, body }) =>
          invoke<openapi.ContentItemOut>(
            openapi.domainProjectsCreateProjectContentItem as OpenApiOperation<openapi.ContentItemOut>,
            { body, path: { project_id: projectId } },
          ),
        get: ({ projectId, itemId }) =>
          invoke<openapi.ContentItemOut>(
            openapi.domainProjectsGetProjectContentItem as OpenApiOperation<openapi.ContentItemOut>,
            { path: { item_id: itemId, project_id: projectId } },
          ),
        delete: ({ projectId, itemId }) =>
          invoke<openapi.ContentItemOut>(
            openapi.domainProjectsDeleteProjectContentItem as OpenApiOperation<openapi.ContentItemOut>,
            { path: { item_id: itemId, project_id: projectId } },
          ),
        archive: ({ projectId, itemId }) =>
          invoke<openapi.ContentItemOut>(
            openapi.domainProjectsArchiveProjectContentItem as OpenApiOperation<openapi.ContentItemOut>,
            { path: { item_id: itemId, project_id: projectId } },
          ),
        applyBootstrapShape: ({ projectId, itemId, body }) =>
          invoke<openapi.ContentItemOut>(
            openapi.domainProjectsApplyProjectContentItemBootstrapShape as OpenApiOperation<openapi.ContentItemOut>,
            { body, path: { item_id: itemId, project_id: projectId } },
          ),
        duplicate: ({ projectId, itemId }) =>
          invoke<openapi.ContentItemOut>(
            openapi.domainProjectsDuplicateProjectContentItem as OpenApiOperation<openapi.ContentItemOut>,
            { path: { item_id: itemId, project_id: projectId } },
          ),
        unarchive: ({ projectId, itemId }) =>
          invoke<openapi.ContentItemOut>(
            openapi.domainProjectsUnarchiveProjectContentItem as OpenApiOperation<openapi.ContentItemOut>,
            { path: { item_id: itemId, project_id: projectId } },
          ),
        versions: {
          list: ({ projectId, itemId }) =>
            invokePage<openapi.ContentVersionOut, PagePayload<openapi.ContentVersionOut>>(
              openapi.domainProjectsListProjectContentItemVersions as OpenApiOperation<
                PagePayload<openapi.ContentVersionOut>
              >,
              { path: { item_id: itemId, project_id: projectId } },
            ),
          saveDraft: ({ projectId, itemId, body }) =>
            invoke<openapi.ContentVersionOut>(
              openapi.domainProjectsSaveProjectContentItemDraftVersion as OpenApiOperation<openapi.ContentVersionOut>,
              { body, path: { item_id: itemId, project_id: projectId } },
            ),
          get: ({ projectId, itemId, versionNumber }) =>
            invoke<openapi.ContentVersionOut>(
              openapi.domainProjectsGetProjectContentItemVersion as OpenApiOperation<openapi.ContentVersionOut>,
              {
                path: { item_id: itemId, project_id: projectId, version_number: versionNumber },
              },
            ),
          patch: ({ projectId, itemId, versionNumber, body }) =>
            invoke<openapi.ContentVersionOut>(
              openapi.domainProjectsPatchProjectContentItemVersion as OpenApiOperation<openapi.ContentVersionOut>,
              {
                body,
                path: { item_id: itemId, project_id: projectId, version_number: versionNumber },
              },
            ),
          publish: ({ projectId, itemId, versionNumber, body = {} }) =>
            invoke<openapi.ContentVersionOut>(
              openapi.domainProjectsPublishProjectContentItemVersion as OpenApiOperation<openapi.ContentVersionOut>,
              {
                body,
                path: { item_id: itemId, project_id: projectId, version_number: versionNumber },
              },
            ),
        },
      },
      models: {
        list: ({ projectId, page, size }) =>
          invokePage<openapi.ContentModelOut, PagePayload<openapi.ContentModelOut>>(
            openapi.domainProjectsListProjectContentModels as OpenApiOperation<
              PagePayload<openapi.ContentModelOut>
            >,
            { path: { project_id: projectId }, query: { page, size } },
          ),
        create: ({ projectId, body }) =>
          invoke<openapi.ContentModelMutationOut>(
            openapi.domainProjectsCreateProjectContentModel as OpenApiOperation<openapi.ContentModelMutationOut>,
            { body, path: { project_id: projectId } },
          ),
        update: ({ projectId, modelId, body }) =>
          invoke<openapi.ContentModelMutationOut>(
            openapi.domainProjectsUpdateProjectContentModel as OpenApiOperation<openapi.ContentModelMutationOut>,
            { body, path: { model_id: modelId, project_id: projectId } },
          ),
        previewUpdate: ({ projectId, modelId, body }) =>
          invoke<openapi.ContentModelImpactPreviewOut>(
            openapi.domainProjectsPreviewProjectContentModelUpdate as OpenApiOperation<openapi.ContentModelImpactPreviewOut>,
            { body, path: { model_id: modelId, project_id: projectId } },
          ),
      },
      routing: {
        listBindings: ({ projectId }) =>
          invoke<openapi.RouteBindingOut[]>(
            openapi.domainProjectsListProjectContentRouteBindings as OpenApiOperation<
              openapi.RouteBindingOut[]
            >,
            { path: { project_id: projectId } },
          ),
        upsertBinding: ({ projectId, itemId, body }) =>
          invoke<openapi.RouteBindingOut>(
            openapi.domainProjectsUpsertProjectContentRouteBinding as OpenApiOperation<openapi.RouteBindingOut>,
            { body, path: { item_id: itemId, project_id: projectId } },
          ),
      },
    },
    releases: {
      list: ({ projectId }) =>
        invoke<ReleaseListContract>(
          openapi.domainProjectsListProjectReleases as OpenApiOperation<ReleaseListContract>,
          { path: { project_id: projectId } },
        ),
      publishImpact: ({ projectId }) =>
        invoke<PublishImpactContract>(
          openapi.domainProjectsGetProjectPublishImpact as OpenApiOperation<PublishImpactContract>,
          { path: { project_id: projectId } },
        ),
      publishPreviewContract: ({ projectId }) =>
        invoke<PublishPreviewContract>(
          openapi.domainProjectsGetProjectPublishPreviewContract as OpenApiOperation<PublishPreviewContract>,
          { path: { project_id: projectId } },
        ),
      dryRun: ({ projectId }) =>
        invoke<ReleaseDryRunContract>(
          openapi.domainProjectsGetProjectReleaseDryRun as OpenApiOperation<ReleaseDryRunContract>,
          { path: { project_id: projectId } },
        ),
      publish: ({ projectId }) =>
        invoke<ReleasePublishContract>(
          openapi.domainProjectsPublishProjectRelease as OpenApiOperation<ReleasePublishContract>,
          { path: { project_id: projectId } },
        ),
      get: ({ projectId, releaseId }) =>
        invoke<ReleaseContract>(
          openapi.domainProjectsGetProjectRelease as OpenApiOperation<ReleaseContract>,
          { path: { project_id: projectId, release_id: releaseId } },
        ),
      rollback: ({ projectId, releaseId }) =>
        invoke<ReleaseRollbackContract>(
          openapi.domainProjectsRollbackProjectRelease as OpenApiOperation<ReleaseRollbackContract>,
          { path: { project_id: projectId, release_id: releaseId } },
        ),
    },
    site: {
      get: ({ projectId }) =>
        invoke<openapi.ProjectRuntimeSiteOut>(
          openapi.domainProjectsGetProjectSiteRuntime as OpenApiOperation<openapi.ProjectRuntimeSiteOut>,
          { path: { project_id: projectId } },
        ),
      getCoreSettings: ({ projectId }) =>
        invoke<openapi.ProjectSettingsDetail>(
          openapi.domainProjectsGetProjectCoreSettings as OpenApiOperation<openapi.ProjectSettingsDetail>,
          { path: { project_id: projectId } },
        ),
      patchCoreSettings: ({ projectId, body }) =>
        invoke<openapi.ProjectSettingsDetail>(
          openapi.domainProjectsPatchProjectCoreSettings as OpenApiOperation<openapi.ProjectSettingsDetail>,
          { body, path: { project_id: projectId } },
        ),
      createPreviewToken: ({ projectId, body }) =>
        invoke<openapi.SitePreviewTokenOut>(
          openapi.domainProjectsCreateProjectSitePreviewToken as OpenApiOperation<openapi.SitePreviewTokenOut>,
          { body, path: { project_id: projectId } },
        ),
    },
  };
};
