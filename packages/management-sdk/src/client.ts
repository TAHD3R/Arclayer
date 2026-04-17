import * as openapi from "@arclayer/openapi";

import type {
  ApiEnvelope,
  ManagementPage,
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
    readonly workspace: {
      create(input: {
        body: openapi.WorkspaceApiKeyCreateIn;
        workspaceId: string;
      }): Promise<ManagementResult<openapi.ApiKeyCreateOut>>;
      get(input: {
        keyId: string;
        workspaceId: string;
      }): Promise<ManagementResult<openapi.ApiKeyOut>>;
      list(input: { workspaceId: string }): Promise<ManagementResult<openapi.ApiKeyListOut>>;
      revoke(input: {
        keyId: string;
        workspaceId: string;
      }): Promise<ManagementResult<openapi.ApiKeyOut>>;
      rotate(input: {
        keyId: string;
        workspaceId: string;
      }): Promise<ManagementResult<openapi.ApiKeyCreateOut>>;
    };
  };
  readonly content: {
    readonly items: {
      applyBootstrapShape(input: {
        body: openapi.ContentItemBootstrapShapeIn;
        itemId: string;
        workspaceId: string;
      }): Promise<ManagementResult<openapi.ContentItemOut>>;
      archive(input: {
        itemId: string;
        workspaceId: string;
      }): Promise<ManagementResult<openapi.ContentItemOut>>;
      create(input: {
        body: openapi.ContentItemCreateIn;
        workspaceId: string;
      }): Promise<ManagementResult<openapi.ContentItemOut>>;
      delete(input: {
        itemId: string;
        workspaceId: string;
      }): Promise<ManagementResult<openapi.ContentItemOut>>;
      duplicate(input: {
        itemId: string;
        workspaceId: string;
      }): Promise<ManagementResult<openapi.ContentItemOut>>;
      get(input: {
        itemId: string;
        workspaceId: string;
      }): Promise<ManagementResult<openapi.ContentItemOut>>;
      list(input: {
        modelKey?: string | null;
        page?: number;
        size?: number;
        workspaceId: string;
      }): Promise<ManagementPage<openapi.ContentItemOut>>;
      readonly versions: {
        get(input: {
          itemId: string;
          versionNumber: number;
          workspaceId: string;
        }): Promise<ManagementResult<openapi.ContentVersionOut>>;
        list(input: {
          itemId: string;
          workspaceId: string;
        }): Promise<ManagementPage<openapi.ContentVersionOut>>;
        patch(input: {
          body: openapi.ContentVersionPatchIn;
          itemId: string;
          versionNumber: number;
          workspaceId: string;
        }): Promise<ManagementResult<openapi.ContentVersionOut>>;
        publish(input: {
          body?: Record<string, never>;
          itemId: string;
          versionNumber: number;
          workspaceId: string;
        }): Promise<ManagementResult<openapi.ContentVersionOut>>;
        saveDraft(input: {
          body: openapi.ContentVersionDraftSaveIn;
          itemId: string;
          workspaceId: string;
        }): Promise<ManagementResult<openapi.ContentVersionOut>>;
      };
      unarchive(input: {
        itemId: string;
        workspaceId: string;
      }): Promise<ManagementResult<openapi.ContentItemOut>>;
    };
    readonly models: {
      create(input: {
        body: openapi.ContentModelDefinitionContract;
        workspaceId: string;
      }): Promise<ManagementResult<openapi.ContentModelMutationOut>>;
      list(input: {
        page?: number;
        size?: number;
        workspaceId: string;
      }): Promise<ManagementPage<openapi.ContentModelOut>>;
      previewUpdate(input: {
        body: openapi.ContentModelDefinitionPatchContract;
        modelId: string;
        workspaceId: string;
      }): Promise<ManagementResult<openapi.ContentModelImpactPreviewOut>>;
      update(input: {
        body: openapi.ContentModelDefinitionPatchContract;
        modelId: string;
        workspaceId: string;
      }): Promise<ManagementResult<openapi.ContentModelMutationOut>>;
    };
    readonly routing: {
      listBindings(input: {
        workspaceId: string;
      }): Promise<ManagementResult<openapi.RouteBindingOut[]>>;
      upsertBinding(input: {
        body: openapi.RouteBindingUpsertIn;
        itemId: string;
        workspaceId: string;
      }): Promise<ManagementResult<openapi.RouteBindingOut>>;
    };
  };
  readonly rawClient: openapi.ApiClient;
  readonly releases: {
    get(input: {
      releaseId: string;
      workspaceId: string;
    }): Promise<ManagementResult<openapi.ReleaseOut>>;
    list(input: { workspaceId: string }): Promise<ManagementResult<openapi.ReleaseListOut>>;
    publish(input: { workspaceId: string }): Promise<ManagementResult<openapi.ReleasePublishOut>>;
    rollback(input: {
      releaseId: string;
      workspaceId: string;
    }): Promise<ManagementResult<openapi.ReleaseRollbackOut>>;
  };
  readonly site: {
    createPreviewToken(input: {
      body: openapi.SitePreviewTokenCreateIn;
      workspaceId: string;
    }): Promise<ManagementResult<openapi.SitePreviewTokenOut>>;
    get(input: { workspaceId: string }): Promise<ManagementResult<openapi.WorkspaceSiteOut>>;
    getCoreSettings(input: {
      workspaceId: string;
    }): Promise<ManagementResult<openapi.WorkspaceSettingsDetail>>;
    patchCoreSettings(input: {
      body: openapi.WorkspaceSettingsPatch;
      workspaceId: string;
    }): Promise<ManagementResult<openapi.WorkspaceSettingsDetail>>;
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
      workspace: {
        list: ({ workspaceId }) =>
          invoke<openapi.ApiKeyListOut>(
            openapi.domainWorkspacesListWorkspaceApiKeys as OpenApiOperation<openapi.ApiKeyListOut>,
            { path: { workspace_id: workspaceId } },
          ),
        create: ({ workspaceId, body }) =>
          invoke<openapi.ApiKeyCreateOut>(
            openapi.domainWorkspacesCreateWorkspaceApiKey as OpenApiOperation<openapi.ApiKeyCreateOut>,
            { body, path: { workspace_id: workspaceId } },
          ),
        get: ({ workspaceId, keyId }) =>
          invoke<openapi.ApiKeyOut>(
            openapi.domainWorkspacesGetWorkspaceApiKey as OpenApiOperation<openapi.ApiKeyOut>,
            { path: { key_id: keyId, workspace_id: workspaceId } },
          ),
        revoke: ({ workspaceId, keyId }) =>
          invoke<openapi.ApiKeyOut>(
            openapi.domainWorkspacesRevokeWorkspaceApiKey as OpenApiOperation<openapi.ApiKeyOut>,
            { path: { key_id: keyId, workspace_id: workspaceId } },
          ),
        rotate: ({ workspaceId, keyId }) =>
          invoke<openapi.ApiKeyCreateOut>(
            openapi.domainWorkspacesRotateWorkspaceApiKey as OpenApiOperation<openapi.ApiKeyCreateOut>,
            { path: { key_id: keyId, workspace_id: workspaceId } },
          ),
      },
    },
    content: {
      items: {
        list: ({ workspaceId, modelKey, page, size }) =>
          invokePage<openapi.ContentItemOut, PagePayload<openapi.ContentItemOut>>(
            openapi.domainWorkspacesListWorkspaceContentItemsCanonical as OpenApiOperation<
              PagePayload<openapi.ContentItemOut>
            >,
            {
              path: { workspace_id: workspaceId },
              query: { modelKey, page, size },
            },
          ),
        create: ({ workspaceId, body }) =>
          invoke<openapi.ContentItemOut>(
            openapi.domainWorkspacesCreateWorkspaceContentItemCanonical as OpenApiOperation<openapi.ContentItemOut>,
            { body, path: { workspace_id: workspaceId } },
          ),
        get: ({ workspaceId, itemId }) =>
          invoke<openapi.ContentItemOut>(
            openapi.domainWorkspacesGetWorkspaceContentItemCanonical as OpenApiOperation<openapi.ContentItemOut>,
            { path: { item_id: itemId, workspace_id: workspaceId } },
          ),
        delete: ({ workspaceId, itemId }) =>
          invoke<openapi.ContentItemOut>(
            openapi.domainWorkspacesDeleteWorkspaceContentItemCanonical as OpenApiOperation<openapi.ContentItemOut>,
            { path: { item_id: itemId, workspace_id: workspaceId } },
          ),
        archive: ({ workspaceId, itemId }) =>
          invoke<openapi.ContentItemOut>(
            openapi.domainWorkspacesArchiveWorkspaceContentItemCanonical as OpenApiOperation<openapi.ContentItemOut>,
            { path: { item_id: itemId, workspace_id: workspaceId } },
          ),
        applyBootstrapShape: ({ workspaceId, itemId, body }) =>
          invoke<openapi.ContentItemOut>(
            openapi.domainWorkspacesApplyWorkspaceContentItemBootstrapShape as OpenApiOperation<openapi.ContentItemOut>,
            { body, path: { item_id: itemId, workspace_id: workspaceId } },
          ),
        duplicate: ({ workspaceId, itemId }) =>
          invoke<openapi.ContentItemOut>(
            openapi.domainWorkspacesDuplicateWorkspaceContentItemCanonical as OpenApiOperation<openapi.ContentItemOut>,
            { path: { item_id: itemId, workspace_id: workspaceId } },
          ),
        unarchive: ({ workspaceId, itemId }) =>
          invoke<openapi.ContentItemOut>(
            openapi.domainWorkspacesUnarchiveWorkspaceContentItemCanonical as OpenApiOperation<openapi.ContentItemOut>,
            { path: { item_id: itemId, workspace_id: workspaceId } },
          ),
        versions: {
          list: ({ workspaceId, itemId }) =>
            invokePage<openapi.ContentVersionOut, PagePayload<openapi.ContentVersionOut>>(
              openapi.domainWorkspacesListWorkspaceContentItemVersionsCanonical as OpenApiOperation<
                PagePayload<openapi.ContentVersionOut>
              >,
              { path: { item_id: itemId, workspace_id: workspaceId } },
            ),
          saveDraft: ({ workspaceId, itemId, body }) =>
            invoke<openapi.ContentVersionOut>(
              openapi.domainWorkspacesSaveWorkspaceContentItemDraftVersionCanonical as OpenApiOperation<openapi.ContentVersionOut>,
              { body, path: { item_id: itemId, workspace_id: workspaceId } },
            ),
          get: ({ workspaceId, itemId, versionNumber }) =>
            invoke<openapi.ContentVersionOut>(
              openapi.domainWorkspacesGetWorkspaceContentItemVersionCanonical as OpenApiOperation<openapi.ContentVersionOut>,
              {
                path: { item_id: itemId, version_number: versionNumber, workspace_id: workspaceId },
              },
            ),
          patch: ({ workspaceId, itemId, versionNumber, body }) =>
            invoke<openapi.ContentVersionOut>(
              openapi.domainWorkspacesPatchWorkspaceContentItemVersionCanonical as OpenApiOperation<openapi.ContentVersionOut>,
              {
                body,
                path: { item_id: itemId, version_number: versionNumber, workspace_id: workspaceId },
              },
            ),
          publish: ({ workspaceId, itemId, versionNumber, body = {} }) =>
            invoke<openapi.ContentVersionOut>(
              openapi.domainWorkspacesPublishWorkspaceContentItemVersionCanonical as OpenApiOperation<openapi.ContentVersionOut>,
              {
                body,
                path: { item_id: itemId, version_number: versionNumber, workspace_id: workspaceId },
              },
            ),
        },
      },
      models: {
        list: ({ workspaceId, page, size }) =>
          invokePage<openapi.ContentModelOut, PagePayload<openapi.ContentModelOut>>(
            openapi.domainWorkspacesListWorkspaceContentModelsCanonical as OpenApiOperation<
              PagePayload<openapi.ContentModelOut>
            >,
            { path: { workspace_id: workspaceId }, query: { page, size } },
          ),
        create: ({ workspaceId, body }) =>
          invoke<openapi.ContentModelMutationOut>(
            openapi.domainWorkspacesCreateWorkspaceContentModel as OpenApiOperation<openapi.ContentModelMutationOut>,
            { body, path: { workspace_id: workspaceId } },
          ),
        update: ({ workspaceId, modelId, body }) =>
          invoke<openapi.ContentModelMutationOut>(
            openapi.domainWorkspacesUpdateWorkspaceContentModel as OpenApiOperation<openapi.ContentModelMutationOut>,
            { body, path: { model_id: modelId, workspace_id: workspaceId } },
          ),
        previewUpdate: ({ workspaceId, modelId, body }) =>
          invoke<openapi.ContentModelImpactPreviewOut>(
            openapi.domainWorkspacesPreviewWorkspaceContentModelUpdate as OpenApiOperation<openapi.ContentModelImpactPreviewOut>,
            { body, path: { model_id: modelId, workspace_id: workspaceId } },
          ),
      },
      routing: {
        listBindings: ({ workspaceId }) =>
          invoke<openapi.RouteBindingOut[]>(
            openapi.domainWorkspacesListWorkspaceContentRouteBindingsCanonical as OpenApiOperation<
              openapi.RouteBindingOut[]
            >,
            { path: { workspace_id: workspaceId } },
          ),
        upsertBinding: ({ workspaceId, itemId, body }) =>
          invoke<openapi.RouteBindingOut>(
            openapi.domainWorkspacesUpsertWorkspaceContentRouteBindingCanonical as OpenApiOperation<openapi.RouteBindingOut>,
            { body, path: { item_id: itemId, workspace_id: workspaceId } },
          ),
      },
    },
    releases: {
      list: ({ workspaceId }) =>
        invoke<openapi.ReleaseListOut>(
          openapi.domainWorkspacesListWorkspaceReleases as OpenApiOperation<openapi.ReleaseListOut>,
          { path: { workspace_id: workspaceId } },
        ),
      publish: ({ workspaceId }) =>
        invoke<openapi.ReleasePublishOut>(
          openapi.domainWorkspacesPublishWorkspaceRelease as OpenApiOperation<openapi.ReleasePublishOut>,
          { path: { workspace_id: workspaceId } },
        ),
      get: ({ workspaceId, releaseId }) =>
        invoke<openapi.ReleaseOut>(
          openapi.domainWorkspacesGetWorkspaceRelease as OpenApiOperation<openapi.ReleaseOut>,
          { path: { release_id: releaseId, workspace_id: workspaceId } },
        ),
      rollback: ({ workspaceId, releaseId }) =>
        invoke<openapi.ReleaseRollbackOut>(
          openapi.domainWorkspacesRollbackWorkspaceRelease as OpenApiOperation<openapi.ReleaseRollbackOut>,
          { path: { release_id: releaseId, workspace_id: workspaceId } },
        ),
    },
    site: {
      get: ({ workspaceId }) =>
        invoke<openapi.WorkspaceSiteOut>(
          openapi.domainWorkspacesGetWorkspaceSite as OpenApiOperation<openapi.WorkspaceSiteOut>,
          { path: { workspace_id: workspaceId } },
        ),
      getCoreSettings: ({ workspaceId }) =>
        invoke<openapi.WorkspaceSettingsDetail>(
          openapi.domainWorkspacesGetWorkspaceCoreSettings as OpenApiOperation<openapi.WorkspaceSettingsDetail>,
          { path: { workspace_id: workspaceId } },
        ),
      patchCoreSettings: ({ workspaceId, body }) =>
        invoke<openapi.WorkspaceSettingsDetail>(
          openapi.domainWorkspacesPatchWorkspaceCoreSettings as OpenApiOperation<openapi.WorkspaceSettingsDetail>,
          { body, path: { workspace_id: workspaceId } },
        ),
      createPreviewToken: ({ workspaceId, body }) =>
        invoke<openapi.SitePreviewTokenOut>(
          openapi.domainWorkspacesCreateWorkspaceSitePreviewToken as OpenApiOperation<openapi.SitePreviewTokenOut>,
          { body, path: { workspace_id: workspaceId } },
        ),
    },
  };
};
