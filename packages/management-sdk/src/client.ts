import * as openapi from "@arclayer/openapi";

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
      body: openapi.AutomationFlowCreateIn;
      projectId: string;
    }): Promise<ManagementResult<openapi.AutomationFlowOut>>;
    deleteFlow(input: { flowId: string; projectId: string }): Promise<ManagementResult<null>>;
    getCatalog(input: {
      projectId: string;
    }): Promise<ManagementResult<openapi.AutomationCatalogOut>>;
    getRun(input: {
      projectId: string;
      runId: string;
    }): Promise<ManagementResult<openapi.AutomationRunOut>>;
    listFlows(input: {
      projectId: string;
    }): Promise<ManagementResult<openapi.AutomationFlowListOut>>;
    listRuns(input: {
      limit?: number;
      projectId: string;
    }): Promise<ManagementResult<openapi.AutomationRunListOut>>;
    updateFlow(input: {
      body: openapi.AutomationFlowPatchIn;
      flowId: string;
      projectId: string;
    }): Promise<ManagementResult<openapi.AutomationFlowOut>>;
  };
  readonly apiKeys: {
    readonly personal: {
      create(input: {
        body: openapi.PersonalApiKeyCreateIn;
      }): Promise<ManagementResult<openapi.ApiKeyCreateOut>>;
      get(input: { keyId: string }): Promise<ManagementResult<openapi.ApiKeyOut>>;
      list(): Promise<ManagementResult<openapi.ApiKeyListOut>>;
      revoke(input: { keyId: string }): Promise<ManagementResult<openapi.ApiKeyOut>>;
      rotate(input: { keyId: string }): Promise<ManagementResult<openapi.ApiKeyCreateOut>>;
    };
    readonly project: {
      create(input: {
        body: openapi.ProjectApiKeyCreateIn;
        projectId: string;
      }): Promise<ManagementResult<openapi.ApiKeyCreateOut>>;
      get(input: {
        keyId: string;
        projectId: string;
      }): Promise<ManagementResult<openapi.ApiKeyOut>>;
      list(input: { projectId: string }): Promise<ManagementResult<openapi.ApiKeyListOut>>;
      revoke(input: {
        keyId: string;
        projectId: string;
      }): Promise<ManagementResult<openapi.ApiKeyOut>>;
      rotate(input: {
        keyId: string;
        projectId: string;
      }): Promise<ManagementResult<openapi.ApiKeyCreateOut>>;
    };
  };
  readonly content: {
    readonly items: {
      applyBootstrapShape(input: {
        body: openapi.ContentItemBootstrapShapeIn;
        itemId: string;
        projectId: string;
      }): Promise<ManagementResult<openapi.ContentItemOut>>;
      archive(input: {
        itemId: string;
        projectId: string;
      }): Promise<ManagementResult<openapi.ContentItemOut>>;
      create(input: {
        body: openapi.ContentItemCreateIn;
        projectId: string;
      }): Promise<ManagementResult<openapi.ContentItemOut>>;
      delete(input: {
        itemId: string;
        projectId: string;
      }): Promise<ManagementResult<openapi.ContentItemOut>>;
      duplicate(input: {
        itemId: string;
        projectId: string;
      }): Promise<ManagementResult<openapi.ContentItemOut>>;
      get(input: {
        itemId: string;
        projectId: string;
      }): Promise<ManagementResult<openapi.ContentItemOut>>;
      list(input: {
        modelKey?: string | null;
        page?: number;
        projectId: string;
        size?: number;
      }): Promise<ManagementPage<openapi.ContentItemOut>>;
      readonly versions: {
        get(input: {
          itemId: string;
          projectId: string;
          versionNumber: number;
        }): Promise<ManagementResult<openapi.ContentVersionOut>>;
        list(input: {
          itemId: string;
          projectId: string;
        }): Promise<ManagementPage<openapi.ContentVersionOut>>;
        patch(input: {
          body: openapi.ContentVersionPatchIn;
          itemId: string;
          projectId: string;
          versionNumber: number;
        }): Promise<ManagementResult<openapi.ContentVersionOut>>;
        publish(input: {
          body?: Record<string, never>;
          itemId: string;
          projectId: string;
          versionNumber: number;
        }): Promise<ManagementResult<openapi.ContentVersionOut>>;
        saveDraft(input: {
          body: openapi.ContentVersionDraftSaveIn;
          itemId: string;
          projectId: string;
        }): Promise<ManagementResult<openapi.ContentVersionOut>>;
      };
      unarchive(input: {
        itemId: string;
        projectId: string;
      }): Promise<ManagementResult<openapi.ContentItemOut>>;
    };
    readonly models: {
      create(input: {
        body: openapi.ContentModelDefinitionContract;
        projectId: string;
      }): Promise<ManagementResult<openapi.ContentModelMutationOut>>;
      list(input: {
        page?: number;
        projectId: string;
        size?: number;
      }): Promise<ManagementPage<openapi.ContentModelOut>>;
      previewUpdate(input: {
        body: openapi.ContentModelDefinitionPatchContract;
        modelId: string;
        projectId: string;
      }): Promise<ManagementResult<openapi.ContentModelImpactPreviewOut>>;
      update(input: {
        body: openapi.ContentModelDefinitionPatchContract;
        modelId: string;
        projectId: string;
      }): Promise<ManagementResult<openapi.ContentModelMutationOut>>;
    };
    readonly routing: {
      listBindings(input: {
        projectId: string;
      }): Promise<ManagementResult<openapi.RouteBindingOut[]>>;
      upsertBinding(input: {
        body: openapi.RouteBindingUpsertIn;
        itemId: string;
        projectId: string;
      }): Promise<ManagementResult<openapi.RouteBindingOut>>;
    };
  };
  readonly rawClient: ManagementRawClient;
  readonly releases: {
    dryRun(input: { projectId: string }): Promise<ManagementResult<openapi.ReleaseDryRunOut>>;
    get(input: {
      projectId: string;
      releaseId: string;
    }): Promise<ManagementResult<openapi.ReleaseOut>>;
    list(input: { projectId: string }): Promise<ManagementResult<openapi.ReleaseListOut>>;
    publishImpact(input: {
      projectId: string;
    }): Promise<ManagementResult<openapi.PublishReadinessOut>>;
    publishPreviewContract(input: {
      projectId: string;
    }): Promise<ManagementResult<openapi.PublishExportContractOut>>;
    publish(input: { projectId: string }): Promise<ManagementResult<openapi.ReleasePublishOut>>;
    rollback(input: {
      projectId: string;
      releaseId: string;
    }): Promise<ManagementResult<openapi.ReleaseRollbackOut>>;
  };
  readonly site: {
    createPreviewToken(input: {
      body: openapi.SitePreviewTokenCreateIn;
      projectId: string;
    }): Promise<ManagementResult<openapi.SitePreviewTokenOut>>;
    get(input: { projectId: string }): Promise<ManagementResult<openapi.ProjectRuntimeSiteOut>>;
    getCoreSettings(input: {
      projectId: string;
    }): Promise<ManagementResult<openapi.ProjectSettingsDetail>>;
    patchCoreSettings(input: {
      body: openapi.ProjectSettingsPatch;
      projectId: string;
    }): Promise<ManagementResult<openapi.ProjectSettingsDetail>>;
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
        invoke<openapi.ReleaseListOut>(
          openapi.domainProjectsListProjectReleases as OpenApiOperation<openapi.ReleaseListOut>,
          { path: { project_id: projectId } },
        ),
      publishImpact: ({ projectId }) =>
        invoke<openapi.PublishReadinessOut>(
          openapi.domainProjectsGetProjectPublishImpact as OpenApiOperation<openapi.PublishReadinessOut>,
          { path: { project_id: projectId } },
        ),
      publishPreviewContract: ({ projectId }) =>
        invoke<openapi.PublishExportContractOut>(
          openapi.domainProjectsGetProjectPublishPreviewContract as OpenApiOperation<openapi.PublishExportContractOut>,
          { path: { project_id: projectId } },
        ),
      dryRun: ({ projectId }) =>
        invoke<openapi.ReleaseDryRunOut>(
          openapi.domainProjectsGetProjectReleaseDryRun as OpenApiOperation<openapi.ReleaseDryRunOut>,
          { path: { project_id: projectId } },
        ),
      publish: ({ projectId }) =>
        invoke<openapi.ReleasePublishOut>(
          openapi.domainProjectsPublishProjectRelease as OpenApiOperation<openapi.ReleasePublishOut>,
          { path: { project_id: projectId } },
        ),
      get: ({ projectId, releaseId }) =>
        invoke<openapi.ReleaseOut>(
          openapi.domainProjectsGetProjectRelease as OpenApiOperation<openapi.ReleaseOut>,
          { path: { project_id: projectId, release_id: releaseId } },
        ),
      rollback: ({ projectId, releaseId }) =>
        invoke<openapi.ReleaseRollbackOut>(
          openapi.domainProjectsRollbackProjectRelease as OpenApiOperation<openapi.ReleaseRollbackOut>,
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
