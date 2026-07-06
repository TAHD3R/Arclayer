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

export type ManagementProjectAiActionRequest = Omit<
  openapi.WorkspaceAiActionRequest,
  "projectId"
> & {
  readonly projectId?: never;
};

export type ManagementContentModelFieldScalar =
  | "boolean"
  | "date_time"
  | "json"
  | "long_text"
  | "number"
  | "text";

export type ManagementContentModelAiFieldMutation =
  | {
      readonly action: "add";
      readonly config?: Record<string, openapi.JsonValueInput> | null;
      readonly key: string;
      readonly label: string;
      readonly required?: boolean;
      readonly scalar: ManagementContentModelFieldScalar;
    }
  | {
      readonly action: "update";
      readonly config?: Record<string, openapi.JsonValueInput> | null;
      readonly key: string;
      readonly label?: string;
      readonly required?: boolean;
      readonly scalar?: ManagementContentModelFieldScalar;
    }
  | {
      readonly action: "delete";
      readonly key: string;
    };

export interface ManagementContentModelField {
  readonly config: Record<string, openapi.JsonValueOutput> | null;
  readonly key: string;
  readonly label: string;
  readonly required: boolean;
  readonly scalar: ManagementContentModelFieldScalar;
}

export interface ManagementContentModelAiUpdateInput {
  readonly description?: string | null;
  readonly fieldMutations?: readonly ManagementContentModelAiFieldMutation[];
  readonly fieldOrder?: readonly string[];
  readonly message?: string;
  readonly modelId: string;
  readonly name?: string;
  readonly projectId: string;
  readonly workspaceId: string;
}

export type ManagementProjectContentModelAiUpdateInput = Omit<
  ManagementContentModelAiUpdateInput,
  "projectId"
>;

const MANAGEMENT_CONTENT_MODEL_FIELD_SCALARS = new Set<string>([
  "boolean",
  "date_time",
  "json",
  "long_text",
  "number",
  "text",
]);

function isManagementContentModelFieldScalar(
  value: unknown,
): value is ManagementContentModelFieldScalar {
  return typeof value === "string" && MANAGEMENT_CONTENT_MODEL_FIELD_SCALARS.has(value);
}

function readManagementContentModelFieldSchemaEntry(
  key: string,
  value: unknown,
): ManagementContentModelField {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("MANAGEMENT_SDK_CONTENT_MODEL_FIELD_SCHEMA_INVALID");
  }
  const entry = value as Record<string, unknown>;
  if (typeof entry.label !== "string" || !isManagementContentModelFieldScalar(entry.scalar)) {
    throw new Error("MANAGEMENT_SDK_CONTENT_MODEL_FIELD_SCHEMA_INVALID");
  }
  if (
    entry.config !== undefined &&
    entry.config !== null &&
    (typeof entry.config !== "object" || Array.isArray(entry.config))
  ) {
    throw new Error("MANAGEMENT_SDK_CONTENT_MODEL_FIELD_SCHEMA_INVALID");
  }
  return {
    config: (entry.config as Record<string, openapi.JsonValueOutput> | null | undefined) ?? null,
    key,
    label: entry.label,
    required: entry.required === true,
    scalar: entry.scalar,
  };
}

export function readManagementContentModelFields(
  model: openapi.ContentModelOut,
): readonly ManagementContentModelField[] {
  if (model.fieldSchema === null || model.fieldSchema === undefined) return [];
  if (Array.isArray(model.fieldSchema)) {
    throw new Error("MANAGEMENT_SDK_CONTENT_MODEL_FIELD_SCHEMA_INVALID");
  }
  return Object.entries(model.fieldSchema).map(([key, value]) =>
    readManagementContentModelFieldSchemaEntry(key, value),
  );
}

export function readManagementContentModelFieldKeys(
  model: openapi.ContentModelOut,
): readonly string[] {
  return readManagementContentModelFields(model).map((field) => field.key);
}

export interface ManagementProjectOverview {
  readonly coreSettings: ManagementResult<openapi.ProjectSettingsDetail>;
  readonly domains: ManagementPage<openapi.DomainBindingOut>;
  readonly projectId: string;
  readonly releases: ManagementResult<openapi.ReleaseListOut>;
  readonly site: ManagementResult<openapi.ProjectRuntimeSiteOut>;
  readonly sourceManifest: ManagementResult<openapi.ProjectSourceManifestOut>;
  readonly sourceStructure: ManagementResult<ManagementProjectSourceStructure>;
}

export type ManagementProjectSourcePatchOperation =
  | {
      readonly body: openapi.ProjectSourceFileUpsertIn;
      readonly filePath: string;
      readonly kind: "upsert";
    }
  | {
      readonly filePath: string;
      readonly kind: "delete";
    };

export type ManagementProjectSourceFileRole = NonNullable<openapi.ProjectSourceFileOut["role"]>;

export interface ManagementProjectSourceTreeNode {
  readonly children: readonly ManagementProjectSourceTreeNode[];
  readonly file: openapi.ProjectSourceFileOut | null;
  readonly name: string;
  readonly path: string;
  readonly type: "directory" | "file";
}

export type ManagementProjectSourceFilesByRole = Partial<
  Record<ManagementProjectSourceFileRole, readonly openapi.ProjectSourceFileOut[]>
>;

export interface ManagementProjectSourceStructure {
  readonly appEntryFile: openapi.ProjectSourceFileOut | null;
  readonly configFile: openapi.ProjectSourceFileOut | null;
  readonly contentFiles: readonly openapi.ProjectSourceFileOut[];
  readonly filesByRole: ManagementProjectSourceFilesByRole;
  readonly manifest: openapi.ProjectSourceManifestOut;
  readonly runtimeFiles: readonly openapi.ProjectSourceFileOut[];
  readonly tree: readonly ManagementProjectSourceTreeNode[];
}

type MutableManagementProjectSourceTreeNode = {
  children: MutableManagementProjectSourceTreeNode[];
  file: openapi.ProjectSourceFileOut | null;
  name: string;
  path: string;
  type: "directory" | "file";
};

export interface ManagementLandingSectionInput {
  readonly body: string;
  readonly key?: string;
  readonly title: string;
}

export interface ManagementReactViteLandingSourceInput {
  readonly accentColor?: string;
  readonly brandName: string;
  readonly canonicalUrl?: string | null;
  readonly deliveryBaseUrlEnv?: string;
  readonly description: string;
  readonly eyebrow?: string;
  readonly faviconUrl?: string | null;
  readonly logoUrl?: string | null;
  readonly packageName?: string;
  readonly primaryCtaLabel?: string;
  readonly runtimeId?: string | null;
  readonly secondaryCtaLabel?: string;
  readonly sections?: readonly ManagementLandingSectionInput[];
  readonly socialImageUrl?: string | null;
}

export interface ManagementProjectHomepageDraftInput {
  readonly ensurePageModel?: boolean;
  readonly fields?: Record<string, openapi.JsonValueInput>;
  readonly locale?: string;
  readonly modelKey?: string;
  readonly path?: string;
  readonly publish?: boolean;
  readonly title?: string;
}

export interface ManagementProjectHomepageDraft {
  readonly draftVersion: ManagementResult<openapi.ContentVersionOut>;
  readonly item: ManagementResult<openapi.ContentItemOut>;
  readonly modelKey: string;
  readonly path: string;
  readonly publishedVersion?: ManagementResult<openapi.ContentVersionOut>;
}

export interface ManagementProjectHomepageLookupInput {
  readonly modelKey?: string;
  readonly version?: "draft" | "published";
}

export interface ManagementProjectHomepageSnapshot {
  readonly heroHeadline: string | null;
  readonly heroSubheading: string | null;
  readonly item: openapi.ContentItemOut;
  readonly modelKey: string;
  readonly path: string | null;
  readonly sectionsCount: number | null;
  readonly title: string;
  readonly version: ManagementResult<openapi.ContentVersionOut>;
}

export interface ManagementProjectHomepageUpdateInput {
  readonly changeSummary?: string;
  readonly expectedVersion?: number;
  readonly fields?: Record<string, openapi.JsonValueInput>;
  readonly modelKey?: string;
  readonly path?: string;
  readonly publish?: boolean;
  readonly title?: string;
}

export interface ManagementProjectHomepageUpdate {
  readonly draftVersion: ManagementResult<openapi.ContentVersionOut>;
  readonly item: openapi.ContentItemOut;
  readonly modelKey: string;
  readonly path: string | null;
  readonly previousVersion: ManagementResult<openapi.ContentVersionOut>;
  readonly publishedVersion?: ManagementResult<openapi.ContentVersionOut>;
}

export interface ManagementEnterpriseLandingPageUpdateInput {
  readonly changeSummary?: string;
  readonly expectedVersion?: number;
  readonly fields?: Record<string, openapi.JsonValueInput>;
  readonly modelKey?: string;
  readonly path?: string;
  readonly publishHomepage?: boolean;
  readonly publishRelease?: boolean;
  readonly releaseBody?: openapi.ReleasePublishIn | null;
  readonly siteSettings?: ManagementProjectSiteSettingsPatchInput;
  readonly sourceOperations?: readonly ManagementProjectSourcePatchOperation[];
  readonly title?: string;
}

export interface ManagementEnterpriseLandingPageUpdate {
  readonly homepage?: ManagementProjectHomepageUpdate;
  readonly release?: ManagementResult<openapi.ReleasePublishOut>;
  readonly releaseDryRun: ManagementResult<openapi.ReleaseDryRunOut>;
  readonly settings?: ManagementResult<openapi.ProjectSettingsDetail>;
  readonly sourceManifest?: ManagementResult<openapi.ProjectSourceManifestOut>;
  readonly sourceSettings?: ManagementResult<openapi.ProjectSettingsDetail>;
  readonly sourceStructure?: ManagementResult<ManagementProjectSourceStructure>;
}

export interface ManagementContentFieldsUpdateInput {
  readonly changeSummary?: string;
  readonly expectedVersion: number | null;
  readonly fields: Record<string, openapi.JsonValueInput>;
  readonly itemId: string;
  readonly projectId: string;
  readonly publish?: boolean;
}

export type ManagementProjectContentFieldsUpdateInput = Omit<
  ManagementContentFieldsUpdateInput,
  "projectId"
>;

export interface ManagementContentFieldsUpdate {
  readonly draftVersion: ManagementResult<openapi.ContentVersionOut>;
  readonly publishedVersion?: ManagementResult<openapi.ContentVersionOut>;
}

export interface ManagementProjectBootstrapSiteInput {
  readonly ensureReusableBlockModel?: boolean;
  readonly homepage?: ManagementProjectHomepageDraftInput;
  readonly publishRelease?: boolean;
  readonly sourceOperations?: readonly ManagementProjectSourcePatchOperation[];
}

export interface ManagementProjectBootstrapSite {
  readonly homepageComponentBindings: ManagementResult<openapi.ContentComponentBindingListOut>;
  readonly homepage: ManagementProjectHomepageDraft;
  readonly hierarchyNodes: ManagementResult<openapi.HierarchyNodeOut[]>;
  readonly release?: ManagementResult<openapi.ReleasePublishOut>;
  readonly releaseDryRun: ManagementResult<openapi.ReleaseDryRunOut>;
  readonly reusableBlockModelKey?: string;
  readonly routeBindings: ManagementResult<openapi.RouteBindingOut[]>;
  readonly sourceManifest: ManagementResult<openapi.ProjectSourceManifestOut>;
}

export interface ManagementWorkspaceActionComponentBinding {
  readonly bindingKey: string;
  readonly componentKey: string;
  readonly payload?: Record<string, openapi.JsonValueOutput>;
}

export interface ManagementWorkspaceActionSiteStructure {
  readonly componentBindingCount: number;
  readonly componentBindings: readonly ManagementWorkspaceActionComponentBinding[];
  readonly hierarchyNodeCount: number | null;
  readonly hierarchyRootItemId: string | null;
  readonly routePath: string | null;
}

export interface ManagementWorkspaceActionReleaseSummary {
  readonly releaseId: string | null;
  readonly releaseNumber: number | null;
  readonly selectionCount: number | null;
}

export interface ManagementEnterpriseLandingSiteCreateInput {
  readonly brandName: string;
  readonly canonicalUrl?: string | null;
  readonly contactEmail?: string | null;
  readonly description: string;
  readonly eyebrow?: string;
  readonly faviconUrl?: string | null;
  readonly framework?: "astro" | "react_vite";
  readonly googleAnalyticsMeasurementId?: string | null;
  readonly heroHeadline?: string;
  readonly heroSubheading?: string;
  readonly locale?: string;
  readonly logoUrl?: string | null;
  readonly primaryCtaLabel?: string;
  readonly projectPrompt?: string;
  readonly publishRelease?: boolean;
  readonly secondaryCtaLabel?: string;
  readonly sections?: readonly ManagementLandingSectionInput[];
  readonly socialImageUrl?: string | null;
  readonly timezone?: string;
  readonly workspaceId: string;
}

export interface ManagementEnterpriseLandingSiteCreateResult {
  readonly bootstrap: ManagementProjectBootstrapSite;
  readonly contentModels: ManagementPage<openapi.ContentModelOut>;
  readonly createProjectAction: ManagementResult<openapi.WorkspaceAiActionResponse>;
  readonly createProjectSiteStructure: ManagementWorkspaceActionSiteStructure | null;
  readonly domains: ManagementPage<openapi.DomainBindingOut>;
  readonly primaryDomain: openapi.DomainBindingOut | null;
  readonly project: ManagementProjectSdk;
  readonly projectId: string;
  readonly settings: ManagementResult<openapi.ProjectSettingsDetail>;
  readonly sourceSettings: ManagementResult<openapi.ProjectSettingsDetail>;
  readonly sourceStructure: ManagementResult<ManagementProjectSourceStructure>;
  readonly summary: ManagementEnterpriseLandingSiteSummary;
}

export interface ManagementEnterpriseLandingSiteSummary {
  readonly appEntryPath: string | null;
  readonly componentBindingCount: number;
  readonly editorPath: string | null;
  readonly homepageItemId: string | null;
  readonly hierarchyNodeCount: number;
  readonly primaryDomainHostname: string | null;
  readonly projectId: string;
  readonly releaseNumber: number | null;
  readonly releaseReady: boolean | null;
  readonly routePath: string | null;
  readonly sourceFileCount: number;
}

export type ManagementProjectSourceSettingsPatchInput = Partial<{
  readonly artifactStrategy: "container_image" | "object_storage";
  readonly buildCommand: string;
  readonly framework: "astro" | "react_vite";
  readonly outputDirectory: string;
  readonly packageManager: "npm" | "pnpm";
  readonly rootDirectory: string;
  readonly sourceProvider: "git" | "managed";
}>;

export interface ManagementProjectSiteSettingsPatchInput {
  readonly analytics?: {
    readonly googleAnalytics?: {
      readonly enabled: boolean;
      readonly measurementId?: string | null;
    };
  };
  readonly localization?: {
    readonly dateFormat?: string;
    readonly defaultLocale?: string;
    readonly fallbackLocale?: string;
    readonly locale?: string;
    readonly supportedLocales?: readonly string[];
    readonly timezone?: string;
  };
  readonly seo?: {
    readonly defaultDescription?: string | null;
    readonly defaultTitle?: string | null;
    readonly ogImageAssetId?: string | null;
    readonly ogImageUrl?: string | null;
    readonly robotsDirective?: string | null;
    readonly sitemapEnabled?: boolean;
    readonly titlePolicyV1?: Record<string, openapi.JsonValueInput>;
  };
  readonly site?: {
    readonly contactEmail?: string | null;
    readonly description?: string | null;
    readonly faviconUrl?: string | null;
    readonly logoUrl?: string | null;
    readonly name?: string;
    readonly subtitle?: string | null;
    readonly url?: string;
  };
  readonly source?: ManagementProjectSourceSettingsPatchInput;
}

export interface ManagementReusableBlockModelContractInput {
  readonly description?: string | null;
  readonly fields?: readonly openapi.ContentModelFieldContract[];
  readonly name?: string;
  readonly pluralKey?: string;
  readonly singularKey?: string;
}

export interface ManagementProjectSdk {
  readonly projectId: string;
  getOverview(): Promise<ManagementProjectOverview>;
  readonly ai: {
    executeWorkspaceAction(input: {
      body: ManagementProjectAiActionRequest;
    }): Promise<ManagementResult<openapi.WorkspaceAiActionResponse>>;
  };
  readonly content: {
    readonly items: {
      applyBootstrapShape(input: {
        body: openapi.ContentItemBootstrapShapeIn;
        itemId: string;
      }): Promise<ManagementResult<openapi.ContentItemOut>>;
      archive(input: { itemId: string }): Promise<ManagementResult<openapi.ContentItemOut>>;
      create(input: {
        body: openapi.ContentItemCreateIn;
      }): Promise<ManagementResult<openapi.ContentItemOut>>;
      delete(input: { itemId: string }): Promise<ManagementResult<openapi.ContentItemOut>>;
      duplicate(input: { itemId: string }): Promise<ManagementResult<openapi.ContentItemOut>>;
      get(input: { itemId: string }): Promise<ManagementResult<openapi.ContentItemOut>>;
      list(input?: {
        modelKey?: string | null;
        page?: number;
        size?: number;
      }): Promise<ManagementPage<openapi.ContentItemOut>>;
      publishVersion(input: {
        itemId: string;
        versionNumber: number;
      }): Promise<ManagementResult<openapi.ContentVersionOut>>;
      saveDraft(input: {
        body: openapi.ContentVersionDraftSaveIn;
        itemId: string;
      }): Promise<ManagementResult<openapi.ContentVersionOut>>;
      updateFields(
        input: ManagementProjectContentFieldsUpdateInput,
      ): Promise<ManagementContentFieldsUpdate>;
      readonly versions: {
        get(input: {
          itemId: string;
          versionNumber: number;
        }): Promise<ManagementResult<openapi.ContentVersionOut>>;
        getSeoProfile(input: {
          itemId: string;
          versionNumber: number;
        }): Promise<ManagementResult<openapi.ContentSeoProfileOut>>;
        list(input: { itemId: string }): Promise<ManagementPage<openapi.ContentVersionOut>>;
        listComponentBindings(input: {
          itemId: string;
          versionNumber: number;
        }): Promise<ManagementResult<openapi.ContentComponentBindingListOut>>;
        listPresentations(input: {
          itemId: string;
          versionNumber: number;
        }): Promise<ManagementResult<openapi.ContentPresentationListOut>>;
        patch(input: {
          body: openapi.ContentVersionPatchIn;
          itemId: string;
          versionNumber: number;
        }): Promise<ManagementResult<openapi.ContentVersionOut>>;
        publish(input: {
          body?: never;
          itemId: string;
          versionNumber: number;
        }): Promise<ManagementResult<openapi.ContentVersionOut>>;
        saveDraft(input: {
          body: openapi.ContentVersionDraftSaveIn;
          itemId: string;
        }): Promise<ManagementResult<openapi.ContentVersionOut>>;
      };
      unarchive(input: { itemId: string }): Promise<ManagementResult<openapi.ContentItemOut>>;
    };
    readonly models: {
      create(input: {
        body: openapi.ContentModelDefinitionContract;
      }): Promise<ManagementResult<openapi.ContentModelMutationOut>>;
      delete(input: { modelId: string }): Promise<ManagementResult<null>>;
      readonly fields: {
        create(input: {
          body: openapi.ContentModelFieldContract;
          modelId: string;
        }): Promise<ManagementResult<openapi.ContentModelOut>>;
        delete(input: {
          fieldKey: string;
          modelId: string;
        }): Promise<ManagementResult<openapi.ContentModelOut>>;
        reorder(input: {
          body: openapi.ContentModelFieldReorderContract;
          modelId: string;
        }): Promise<ManagementResult<openapi.ContentModelOut>>;
        update(input: {
          body: openapi.ContentModelFieldPatchContract;
          fieldKey: string;
          modelId: string;
        }): Promise<ManagementResult<openapi.ContentModelOut>>;
      };
      list(input?: {
        category?: string | null;
        modelKind?: string | null;
        page?: number;
        query?: string | null;
        size?: number;
        systemManaged?: boolean | null;
      }): Promise<ManagementPage<openapi.ContentModelOut>>;
      getJsonPreview(input: {
        modelId: string;
      }): Promise<ManagementResult<openapi.ContentModelSchemaSnapshotOut>>;
      listFieldTypes(): Promise<ManagementResult<openapi.ContentModelFieldTypeRegistryOut>>;
      previewUpdate(input: {
        body: openapi.ContentModelDefinitionPatchContract;
        modelId: string;
      }): Promise<ManagementResult<openapi.ContentModelImpactPreviewOut>>;
      update(input: {
        body: openapi.ContentModelDefinitionPatchContract;
        modelId: string;
      }): Promise<ManagementResult<openapi.ContentModelMutationOut>>;
      updateWithAi(
        input: ManagementProjectContentModelAiUpdateInput,
      ): Promise<ManagementResult<openapi.WorkspaceAiActionResponse>>;
    };
    readonly routing: {
      listBindings(): Promise<ManagementResult<openapi.RouteBindingOut[]>>;
      listHierarchyNodes(): Promise<ManagementResult<openapi.HierarchyNodeOut[]>>;
      upsertBinding(input: {
        body: openapi.RouteBindingUpsertIn;
        itemId: string;
      }): Promise<ManagementResult<openapi.RouteBindingOut>>;
      upsertHierarchyNode(input: {
        body: openapi.HierarchyNodeUpsertIn;
        itemId: string;
      }): Promise<ManagementResult<openapi.HierarchyNodeOut>>;
    };
  };
  readonly releases: {
    dryRun(): Promise<ManagementResult<openapi.ReleaseDryRunOut>>;
    get(input: { releaseId: string }): Promise<ManagementResult<openapi.ReleaseOut>>;
    list(): Promise<ManagementResult<openapi.ReleaseListOut>>;
    publish(input?: {
      body?: openapi.ReleasePublishIn | null;
    }): Promise<ManagementResult<openapi.ReleasePublishOut>>;
    publishImpact(): Promise<ManagementResult<openapi.PublishReadinessOut>>;
    publishPreviewContract(): Promise<ManagementResult<openapi.PublishExportContractOut>>;
    rollback(input: { releaseId: string }): Promise<ManagementResult<openapi.ReleaseRollbackOut>>;
  };
  readonly domains: {
    create(input: {
      body: openapi.DomainBindingCreateIn;
    }): Promise<ManagementResult<openapi.DomainBindingCreateOut>>;
    delete(input: { bindingId: string }): Promise<ManagementResult<openapi.DomainBindingDeleteOut>>;
    list(input?: {
      page?: number;
      size?: number;
    }): Promise<ManagementPage<openapi.DomainBindingOut>>;
    update(input: {
      bindingId: string;
      body: openapi.DomainBindingUpdateIn;
    }): Promise<ManagementResult<openapi.DomainBindingOut>>;
    verify(input: { bindingId: string }): Promise<ManagementResult<openapi.DomainBindingVerifyOut>>;
  };
  readonly site: {
    bootstrapSite(
      input?: ManagementProjectBootstrapSiteInput,
    ): Promise<ManagementProjectBootstrapSite>;
    createHomepageDraft(
      input?: ManagementProjectHomepageDraftInput,
    ): Promise<ManagementProjectHomepageDraft>;
    findHomepage(
      input?: ManagementProjectHomepageLookupInput,
    ): Promise<ManagementProjectHomepageSnapshot | null>;
    updateHomepageDraft(
      input?: ManagementProjectHomepageUpdateInput,
    ): Promise<ManagementProjectHomepageUpdate>;
    updateEnterpriseLandingPage(
      input?: ManagementEnterpriseLandingPageUpdateInput,
    ): Promise<ManagementEnterpriseLandingPageUpdate>;
    createPreviewToken(input: {
      body: openapi.SitePreviewTokenCreateIn;
    }): Promise<ManagementResult<openapi.SitePreviewTokenOut>>;
    get(): Promise<ManagementResult<openapi.ProjectRuntimeSiteOut>>;
    getCoreSettings(): Promise<ManagementResult<openapi.ProjectSettingsDetail>>;
    patchCoreSettings(input: {
      body: openapi.ProjectSettingsPatch;
    }): Promise<ManagementResult<openapi.ProjectSettingsDetail>>;
  };
  readonly source: {
    applyPatch(input: {
      operations: readonly ManagementProjectSourcePatchOperation[];
    }): Promise<ManagementResult<openapi.ProjectSourceManifestOut>>;
    deleteFile(input: {
      filePath: string;
    }): Promise<ManagementResult<openapi.ProjectSourceFileDeleteOut>>;
    getManifest(): Promise<ManagementResult<openapi.ProjectSourceManifestOut>>;
    getStructure(): Promise<ManagementResult<ManagementProjectSourceStructure>>;
    readFile(input: { filePath: string }): Promise<ManagementResult<openapi.ProjectSourceFileOut>>;
    updateSettings(
      input: ManagementProjectSourceSettingsPatchInput,
    ): Promise<ManagementResult<openapi.ProjectSettingsDetail>>;
    upsertFile(input: {
      body: openapi.ProjectSourceFileUpsertIn;
      filePath: string;
    }): Promise<ManagementResult<openapi.ProjectSourceFileOut>>;
  };
}

export interface ManagementSdk {
  readonly ai: {
    executeWorkspaceAction(input: {
      body: openapi.WorkspaceAiActionRequest;
    }): Promise<ManagementResult<openapi.WorkspaceAiActionResponse>>;
  };
  readonly siteBuilder: {
    createEnterpriseLandingSite(
      input: ManagementEnterpriseLandingSiteCreateInput,
    ): Promise<ManagementEnterpriseLandingSiteCreateResult>;
  };
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
      publishVersion(input: {
        itemId: string;
        projectId: string;
        versionNumber: number;
      }): Promise<ManagementResult<openapi.ContentVersionOut>>;
      saveDraft(input: {
        body: openapi.ContentVersionDraftSaveIn;
        itemId: string;
        projectId: string;
      }): Promise<ManagementResult<openapi.ContentVersionOut>>;
      updateFields(
        input: ManagementContentFieldsUpdateInput,
      ): Promise<ManagementContentFieldsUpdate>;
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
        getSeoProfile(input: {
          itemId: string;
          projectId: string;
          versionNumber: number;
        }): Promise<ManagementResult<openapi.ContentSeoProfileOut>>;
        list(input: {
          itemId: string;
          projectId: string;
        }): Promise<ManagementPage<openapi.ContentVersionOut>>;
        listComponentBindings(input: {
          itemId: string;
          projectId: string;
          versionNumber: number;
        }): Promise<ManagementResult<openapi.ContentComponentBindingListOut>>;
        listPresentations(input: {
          itemId: string;
          projectId: string;
          versionNumber: number;
        }): Promise<ManagementResult<openapi.ContentPresentationListOut>>;
        patch(input: {
          body: openapi.ContentVersionPatchIn;
          itemId: string;
          projectId: string;
          versionNumber: number;
        }): Promise<ManagementResult<openapi.ContentVersionOut>>;
        publish(input: {
          body?: never;
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
      readonly fields: {
        create(input: {
          body: openapi.ContentModelFieldContract;
          modelId: string;
          projectId: string;
        }): Promise<ManagementResult<openapi.ContentModelOut>>;
        delete(input: {
          fieldKey: string;
          modelId: string;
          projectId: string;
        }): Promise<ManagementResult<openapi.ContentModelOut>>;
        reorder(input: {
          body: openapi.ContentModelFieldReorderContract;
          modelId: string;
          projectId: string;
        }): Promise<ManagementResult<openapi.ContentModelOut>>;
        update(input: {
          body: openapi.ContentModelFieldPatchContract;
          fieldKey: string;
          modelId: string;
          projectId: string;
        }): Promise<ManagementResult<openapi.ContentModelOut>>;
      };
      list(input: {
        category?: string | null;
        modelKind?: string | null;
        page?: number;
        projectId: string;
        query?: string | null;
        size?: number;
        systemManaged?: boolean | null;
      }): Promise<ManagementPage<openapi.ContentModelOut>>;
      getJsonPreview(input: {
        modelId: string;
        projectId: string;
      }): Promise<ManagementResult<openapi.ContentModelSchemaSnapshotOut>>;
      listFieldTypes(input: {
        projectId: string;
      }): Promise<ManagementResult<openapi.ContentModelFieldTypeRegistryOut>>;
      delete(input: { modelId: string; projectId: string }): Promise<ManagementResult<null>>;
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
      updateWithAi(
        input: ManagementContentModelAiUpdateInput,
      ): Promise<ManagementResult<openapi.WorkspaceAiActionResponse>>;
    };
    readonly routing: {
      listBindings(input: {
        projectId: string;
      }): Promise<ManagementResult<openapi.RouteBindingOut[]>>;
      listHierarchyNodes(input: {
        projectId: string;
      }): Promise<ManagementResult<openapi.HierarchyNodeOut[]>>;
      upsertBinding(input: {
        body: openapi.RouteBindingUpsertIn;
        itemId: string;
        projectId: string;
      }): Promise<ManagementResult<openapi.RouteBindingOut>>;
      upsertHierarchyNode(input: {
        body: openapi.HierarchyNodeUpsertIn;
        itemId: string;
        projectId: string;
      }): Promise<ManagementResult<openapi.HierarchyNodeOut>>;
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
    publish(input: {
      body?: openapi.ReleasePublishIn | null;
      projectId: string;
    }): Promise<ManagementResult<openapi.ReleasePublishOut>>;
    rollback(input: {
      projectId: string;
      releaseId: string;
    }): Promise<ManagementResult<openapi.ReleaseRollbackOut>>;
  };
  readonly domains: {
    create(input: {
      body: openapi.DomainBindingCreateIn;
      projectId: string;
    }): Promise<ManagementResult<openapi.DomainBindingCreateOut>>;
    delete(input: {
      bindingId: string;
      projectId: string;
    }): Promise<ManagementResult<openapi.DomainBindingDeleteOut>>;
    list(input: {
      page?: number;
      projectId: string;
      size?: number;
    }): Promise<ManagementPage<openapi.DomainBindingOut>>;
    update(input: {
      bindingId: string;
      body: openapi.DomainBindingUpdateIn;
      projectId: string;
    }): Promise<ManagementResult<openapi.DomainBindingOut>>;
    verify(input: {
      bindingId: string;
      projectId: string;
    }): Promise<ManagementResult<openapi.DomainBindingVerifyOut>>;
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
  readonly source: {
    applyPatch(input: {
      operations: readonly ManagementProjectSourcePatchOperation[];
      projectId: string;
    }): Promise<ManagementResult<openapi.ProjectSourceManifestOut>>;
    deleteFile(input: {
      filePath: string;
      projectId: string;
    }): Promise<ManagementResult<openapi.ProjectSourceFileDeleteOut>>;
    getManifest(input: {
      projectId: string;
    }): Promise<ManagementResult<openapi.ProjectSourceManifestOut>>;
    getStructure(input: {
      projectId: string;
    }): Promise<ManagementResult<ManagementProjectSourceStructure>>;
    readFile(input: {
      filePath: string;
      projectId: string;
    }): Promise<ManagementResult<openapi.ProjectSourceFileOut>>;
    updateSettings(
      input: ManagementProjectSourceSettingsPatchInput & { projectId: string },
    ): Promise<ManagementResult<openapi.ProjectSettingsDetail>>;
    upsertFile(input: {
      body: openapi.ProjectSourceFileUpsertIn;
      filePath: string;
      projectId: string;
    }): Promise<ManagementResult<openapi.ProjectSourceFileOut>>;
  };
  forProject(projectId: string): ManagementProjectSdk;
}

const DEFAULT_HOMEPAGE_TITLE = "Home";
const DEFAULT_HOMEPAGE_PATH = "/";
const DEFAULT_REUSABLE_BLOCK_MODEL_KEY = "reusableBlock";
const DEFAULT_SITE_PAGE_MODEL_KEY = "page";
const DEFAULT_CONTENT_FIELDS_CHANGE_SUMMARY = "Update content fields.";

function normalizeNonEmptyString(value: string | undefined, fallback: string): string {
  const normalized = value?.trim();
  return normalized ? normalized : fallback;
}

export function isManagementSitePageModel(
  model: Pick<openapi.ContentModelOut, "defaultPosture" | "defaultRole" | "singularKey">,
): boolean {
  return (
    model.singularKey === DEFAULT_SITE_PAGE_MODEL_KEY ||
    model.defaultRole === "page" ||
    model.defaultPosture === "page"
  );
}

export function isManagementReusableBlockModel(
  model: Pick<openapi.ContentModelOut, "defaultPosture" | "defaultRole" | "singularKey">,
): boolean {
  return (
    model.singularKey === DEFAULT_REUSABLE_BLOCK_MODEL_KEY ||
    model.singularKey === "reusable-section" ||
    model.defaultRole === "reusable-section" ||
    model.defaultPosture === "composition"
  );
}

export function buildManagementReactViteLandingSource(
  input: ManagementReactViteLandingSourceInput,
): readonly ManagementProjectSourcePatchOperation[] {
  const deliveryBaseUrlEnv = input.deliveryBaseUrlEnv ?? "VITE_ARCLAYER_DELIVERY_URL";
  const runtimeIdEnv = "VITE_ARCLAYER_RUNTIME_ID";
  return [
    sourceUpsert(
      ".env.example",
      reactViteLandingEnvExample(deliveryBaseUrlEnv, runtimeIdEnv),
      "config",
      "dotenv",
    ),
    sourceUpsert(".gitignore", reactViteLandingGitignore(), "config", "ignore"),
    sourceUpsert(
      "README.md",
      reactViteLandingReadme(input, deliveryBaseUrlEnv),
      "config",
      "markdown",
    ),
    sourceUpsert("package.json", reactViteLandingPackageJson(input), "config", "json"),
    sourceUpsert("index.html", reactViteLandingIndexHtml(input), "entry", "html"),
    sourceUpsert("tsconfig.json", reactViteLandingTsconfig(), "config", "json"),
    sourceUpsert("tsconfig.app.json", reactViteLandingTsconfigApp(), "config", "json"),
    sourceUpsert("tsconfig.node.json", reactViteLandingTsconfigNode(), "config", "json"),
    sourceUpsert("vite.config.ts", reactViteLandingViteConfig(), "config", "typescript"),
    sourceUpsert("src/main.tsx", reactViteLandingMainSource(), "entry", "typescriptreact"),
    sourceUpsert(
      "src/vite-env.d.ts",
      '/// <reference types="vite/client" />\n',
      "types",
      "typescript",
    ),
    sourceUpsert("src/App.tsx", reactViteLandingAppSource(input), "entry", "typescriptreact"),
    sourceUpsert("src/index.css", reactViteLandingStylesSource(input), "style", "css"),
    sourceUpsert(
      "src/arclayer/runtime.ts",
      reactViteLandingRuntimeSource(input, runtimeIdEnv),
      "runtime",
      "typescript",
    ),
    sourceUpsert(
      "src/arclayer/site-config.ts",
      reactViteLandingSiteConfigSource(input),
      "config",
      "typescript",
    ),
    sourceUpsert(
      "src/arclayer/content.ts",
      reactViteLandingContentClientSource(deliveryBaseUrlEnv),
      "content",
      "typescript",
    ),
  ];
}

function sourceUpsert(
  filePath: string,
  contents: string,
  role: NonNullable<openapi.ProjectSourceFileUpsertIn["role"]>,
  language: string,
): ManagementProjectSourcePatchOperation {
  return {
    body: {
      contents,
      language,
      role,
    },
    filePath,
    kind: "upsert",
  };
}

function reactViteLandingEnvExample(deliveryBaseUrlEnv: string, runtimeIdEnv: string): string {
  return `${deliveryBaseUrlEnv}=https://api.arclayer.localhost/api/v1
${runtimeIdEnv}=
`;
}

function reactViteLandingGitignore(): string {
  return `node_modules
dist
.env
.env.local
`;
}

function reactViteLandingReadme(
  input: ManagementReactViteLandingSourceInput,
  deliveryBaseUrlEnv: string,
): string {
  return `# ${input.brandName}

Managed React + Vite landing site generated for Arclayer.

## Scripts

- \`pnpm install\`
- \`pnpm dev\`
- \`pnpm build\`

## Runtime

Set \`${deliveryBaseUrlEnv}\` to the Arclayer API base URL and \`VITE_ARCLAYER_RUNTIME_ID\` to the runtime id from the project domain console.

Content is resolved from the published homepage route at \`/\`; source files stay editable through the Arclayer project source API.
`;
}

function reactViteLandingPackageJson(input: ManagementReactViteLandingSourceInput): string {
  return `${JSON.stringify(
    {
      name: input.packageName ?? toPackageName(input.brandName),
      private: true,
      version: "0.0.0",
      type: "module",
      scripts: {
        dev: "vite",
        build: "tsc -b && vite build",
        preview: "vite preview",
      },
      dependencies: {
        react: "latest",
        "react-dom": "latest",
      },
      devDependencies: {
        "@types/react": "latest",
        "@types/react-dom": "latest",
        "@vitejs/plugin-react": "latest",
        typescript: "latest",
        vite: "latest",
      },
    },
    null,
    2,
  )}\n`;
}

function toPackageName(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized ? `arclayer-${normalized}` : "arclayer-managed-site";
}

function reactViteLandingIndexHtml(input: ManagementReactViteLandingSourceInput): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(input.brandName)}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function reactViteLandingTsconfig(): string {
  return `{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
`;
}

function reactViteLandingTsconfigApp(): string {
  return `{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "allowImportingTsExtensions": true,
    "module": "ESNext",
    "moduleDetection": "force",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  },
  "include": ["src"]
}
`;
}

function reactViteLandingTsconfigNode(): string {
  return `{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "moduleDetection": "force",
    "strict": true,
    "noEmit": true
  },
  "include": ["vite.config.ts"]
}
`;
}

function reactViteLandingViteConfig(): string {
  return `import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
});
`;
}

function reactViteLandingMainSource(): string {
  return `import React from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`;
}

function reactViteLandingAppSource(input: ManagementReactViteLandingSourceInput): string {
  const brandName = JSON.stringify(input.brandName);
  const description = JSON.stringify(input.description);
  const eyebrow = JSON.stringify(input.eyebrow ?? "Managed React + Vite site");
  const primaryCtaLabel = JSON.stringify(input.primaryCtaLabel ?? "Start a conversation");
  const secondaryCtaLabel = JSON.stringify(input.secondaryCtaLabel ?? "Explore services");
  const canonicalUrl = JSON.stringify(input.canonicalUrl ?? null);
  const sections = JSON.stringify(
    input.sections?.map((section, index) => ({
      body: section.body,
      key: section.key ?? `section-${index + 1}`,
      title: section.title,
    })) ?? [],
    null,
    2,
  );

  return `import { useEffect, useMemo, useState } from "react";

import { readContent } from "./arclayer/content";
import { getProjectRuntimeConfig } from "./arclayer/runtime";
import { getProjectSiteConfig } from "./arclayer/site-config";

type ApiEnvelope<T> = { data?: T | null };
type LandingSection = { body?: string; key?: string; title?: string };

type LandingPageFields = {
  canonicalUrl?: string | null;
  heroHeadline?: string;
  heroSubheading?: string;
  primaryCtaLabel?: string;
  sections?: LandingSection[];
  title?: string;
};

type DeliveryPageResolve = {
  context?: { primary?: { data?: LandingPageFields } | null } | null;
};

const fallback = {
  brandName: ${brandName},
  canonicalUrl: ${canonicalUrl},
  description: ${description},
  eyebrow: ${eyebrow},
  primaryCtaLabel: ${primaryCtaLabel},
  secondaryCtaLabel: ${secondaryCtaLabel},
  sections: ${sections} satisfies LandingSection[],
};

function upsertNamedMeta(name: string, content: string | null | undefined): void {
  let element = document.head.querySelector<HTMLMetaElement>(\`meta[name="\${name}"]\`);
  if (!content) {
    element?.remove();
    return;
  }
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute("name", name);
    document.head.appendChild(element);
  }
  element.content = content;
}

function upsertPropertyMeta(property: string, content: string | null | undefined): void {
  let element = document.head.querySelector<HTMLMetaElement>(\`meta[property="\${property}"]\`);
  if (!content) {
    element?.remove();
    return;
  }
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute("property", property);
    document.head.appendChild(element);
  }
  element.content = content;
}

function upsertLink(rel: string, href: string | null | undefined): void {
  let element = document.head.querySelector<HTMLLinkElement>(\`link[rel="\${rel}"]\`);
  if (!href) {
    element?.remove();
    return;
  }
  if (!element) {
    element = document.createElement("link");
    element.rel = rel;
    document.head.appendChild(element);
  }
  element.href = href;
}

function syncWebsiteMetadata(config: ReturnType<typeof getProjectSiteConfig>, page: LandingPageFields | null): void {
  const title = page?.title ?? config.seo.defaultTitle ?? config.site.name;
  const description = config.seo.defaultDescription ?? config.site.description;
  const canonicalUrl = page?.canonicalUrl ?? fallback.canonicalUrl ?? config.site.url;
  document.title = title;
  upsertNamedMeta("description", description);
  upsertNamedMeta("robots", config.seo.robotsDirective);
  upsertPropertyMeta("og:title", title);
  upsertPropertyMeta("og:description", description);
  upsertPropertyMeta("og:type", "website");
  upsertPropertyMeta("og:url", canonicalUrl);
  upsertPropertyMeta("og:image", config.seo.socialImageUrl);
  upsertLink("canonical", canonicalUrl);
  upsertLink("icon", config.site.faviconUrl);
}

export function App() {
  const runtime = getProjectRuntimeConfig();
  const config = getProjectSiteConfig();
  const [page, setPage] = useState<LandingPageFields | null>(null);
  const [status, setStatus] = useState("Loading published homepage content...");

  useEffect(() => {
    if (!runtime.runtimeId) {
      setStatus("Runtime id is required before delivery content can be resolved.");
      return;
    }
    let active = true;
    readContent<ApiEnvelope<DeliveryPageResolve>>(
      "/runtimes/" + runtime.runtimeId + "/delivery/pages/resolve",
      { query: { path: "/", perspective: "published" } },
    )
      .then((response) => {
        if (!active) return;
        const resolvedPage = response.data?.context?.primary?.data ?? null;
        setPage(resolvedPage);
        setStatus(
          resolvedPage
            ? "Published content is connected to the Home page item."
            : "Delivery resolved the route, but no primary page content was returned.",
        );
      })
      .catch((error: unknown) => {
        if (!active) return;
        setStatus(error instanceof Error ? error.message : "Delivery content request failed.");
      });
    return () => {
      active = false;
    };
  }, [runtime.runtimeId]);

  useEffect(() => {
    syncWebsiteMetadata(config, page);
  }, [config, page]);

  const sections = useMemo(
    () => (Array.isArray(page?.sections) && page.sections.length ? page.sections : fallback.sections),
    [page],
  );
  const headline = page?.heroHeadline ?? page?.title ?? config.site.name ?? fallback.brandName;
  const subheading = page?.heroSubheading ?? config.site.description ?? fallback.description;
  const ctaLabel = page?.primaryCtaLabel ?? fallback.primaryCtaLabel;
  const ctaHref = page?.canonicalUrl ?? fallback.canonicalUrl ?? config.site.url ?? "#content";

  return (
    <main className="site-shell">
      <section className="hero">
        <p className="eyebrow">{fallback.eyebrow}</p>
        <h1>{headline}</h1>
        <p className="lede">{subheading}</p>
        <div className="actions">
          <a href={ctaHref}>{ctaLabel}</a>
          <a href="#content" className="secondary">{fallback.secondaryCtaLabel}</a>
        </div>
      </section>
      <section id="content" className="section-grid" aria-label="Landing page sections">
        {sections.map((section, index) => (
          <article key={section.key ?? String(index)}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <h2>{section.title ?? "Untitled section"}</h2>
            <p>{section.body ?? "No section body has been written yet."}</p>
          </article>
        ))}
      </section>
      <aside className="status">
        <strong>Arclayer delivery</strong>
        <span>{status}</span>
        <small>{runtime.primaryUrl ?? "No primary domain has been connected yet."}</small>
      </aside>
    </main>
  );
}
`;
}

function reactViteLandingStylesSource(input: ManagementReactViteLandingSourceInput): string {
  const accentColor = input.accentColor ?? "#0f766e";
  return `:root {
  color: #111827;
  background: #f8fafc;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  --accent: ${accentColor};
  --border: #dbe3ea;
  --surface: #ffffff;
}

body { margin: 0; }
a { color: inherit; }
.site-shell {
  display: grid;
  gap: 2rem;
  min-height: 100vh;
  padding: clamp(2rem, 6vw, 5rem);
}
.hero {
  display: grid;
  gap: 1.25rem;
  max-width: 920px;
  min-height: 56vh;
}
.eyebrow {
  color: var(--accent);
  font-size: 0.78rem;
  font-weight: 800;
  margin: 0;
  text-transform: uppercase;
}
h1 {
  font-size: clamp(3.25rem, 8vw, 7rem);
  line-height: 0.92;
  margin: 0;
  max-width: 12ch;
}
.lede {
  color: #334155;
  font-size: clamp(1.1rem, 2vw, 1.45rem);
  line-height: 1.6;
  margin: 0;
  max-width: 64ch;
}
.actions,
.section-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}
.actions a {
  background: #111827;
  border: 1px solid #111827;
  color: #ffffff;
  display: inline-flex;
  font-weight: 800;
  min-height: 2.75rem;
  padding: 0 1rem;
  place-items: center;
  text-decoration: none;
}
.actions .secondary {
  background: transparent;
  color: #111827;
}
.section-grid article,
.status {
  background: var(--surface);
  border: 1px solid var(--border);
  flex: 1 1 18rem;
  padding: 1rem;
}
.section-grid span,
.status strong {
  color: var(--accent);
  font-weight: 800;
}
.section-grid p,
.status span {
  color: #334155;
  line-height: 1.6;
}
.status {
  display: grid;
  gap: 0.35rem;
}
.status small {
  color: #64748b;
}
`;
}

function reactViteLandingRuntimeSource(
  input: ManagementReactViteLandingSourceInput,
  runtimeIdEnv: string,
): string {
  const runtimeId = JSON.stringify(input.runtimeId ?? "");
  const primaryUrl = JSON.stringify(input.canonicalUrl ?? null);
  return `export type ProjectRuntimeConfig = {
  primaryUrl: string | null;
  runtimeId: string;
};

export function getProjectRuntimeConfig(): ProjectRuntimeConfig {
  return {
    primaryUrl: import.meta.env.VITE_ARCLAYER_PRIMARY_URL ?? ${primaryUrl},
    runtimeId: import.meta.env[${JSON.stringify(runtimeIdEnv)}] ?? ${runtimeId},
  };
}
`;
}

function reactViteLandingSiteConfigSource(input: ManagementReactViteLandingSourceInput): string {
  const siteConfig = {
    site: {
      description: input.description,
      faviconUrl: input.faviconUrl ?? null,
      logoUrl: input.logoUrl ?? null,
      name: input.brandName,
      url: input.canonicalUrl ?? null,
    },
    seo: {
      defaultDescription: input.description,
      defaultTitle: input.brandName,
      robotsDirective: "index,follow",
      sitemapEnabled: true,
      socialImageUrl: input.socialImageUrl ?? null,
    },
  };
  return `export type ProjectSiteConfig = {
  seo: {
    defaultDescription: string;
    defaultTitle: string;
    robotsDirective: string;
    sitemapEnabled: boolean;
    socialImageUrl: string | null;
  };
  site: {
    description: string;
    faviconUrl: string | null;
    logoUrl: string | null;
    name: string;
    url: string | null;
  };
};

const projectSiteConfig = ${JSON.stringify(siteConfig, null, 2)} satisfies ProjectSiteConfig;

export function getProjectSiteConfig(): ProjectSiteConfig {
  return projectSiteConfig;
}
`;
}

function reactViteLandingContentClientSource(deliveryBaseUrlEnv: string): string {
  return `type JsonPrimitive = boolean | number | string | null;
type JsonValue = JsonPrimitive | { [key: string]: JsonValue } | JsonValue[];

type ReadContentOptions = {
  query?: Record<string, JsonPrimitive | undefined>;
};

function deliveryBaseUrl(): string {
  const value = import.meta.env[${JSON.stringify(deliveryBaseUrlEnv)}];
  if (!value) {
    throw new Error("${deliveryBaseUrlEnv} is required before Arclayer content can be read.");
  }
  return value.replace(/\\/$/, "");
}

function contentUrl(path: string, options: ReadContentOptions = {}): URL {
  const normalizedPath = path.startsWith("/") ? path : \`/\${path}\`;
  const url = new URL(deliveryBaseUrl() + normalizedPath);
  Object.entries(options.query ?? {}).forEach(([key, value]) => {
    if (value !== undefined) url.searchParams.set(key, String(value));
  });
  return url;
}

export async function readContent<T = JsonValue>(
  path: string,
  options?: ReadContentOptions,
): Promise<T> {
  const response = await fetch(contentUrl(path, options), {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(\`Arclayer delivery request failed: \${response.status}\`);
  }
  return (await response.json()) as T;
}
`;
}

export function buildManagementSitePageModelContract(): openapi.ContentModelDefinitionContract {
  return {
    singularKey: DEFAULT_SITE_PAGE_MODEL_KEY,
    pluralKey: "pages",
    name: "Page",
    description: "Route-owned pages for the website editor, preview, SEO, and releases.",
    category: "site_builder",
    modelKind: "collection_type",
    defaultEditor: "visual",
    defaultRole: "page",
    defaultPosture: "page",
    defaultSurface: "canvas",
    capabilities: [
      "versioned",
      "queryable",
      "routable",
      "treeable",
      "visual_editable",
      "has_slots",
      "publishable",
      "seo_managed",
    ],
    fields: [
      { key: "title", label: "Title", scalar: "text", required: true },
      { key: "path", label: "Path", scalar: "text", required: true },
      { key: "routePattern", label: "Route pattern", scalar: "text", required: false },
      { key: "heroHeadline", label: "Hero headline", scalar: "text", required: false },
      { key: "heroSubheading", label: "Hero subheading", scalar: "long_text", required: false },
      { key: "sections", label: "Sections", scalar: "json", required: false },
    ],
    relations: [],
    routing: { mode: "localized", slugField: "path" },
    workflow: { states: ["draft", "published"], initialState: "draft" },
    views: [
      {
        key: "pages",
        label: "Pages",
        type: "table",
        config: { columns: ["title", "path"] },
      },
    ],
    presentation: { allowedKinds: ["form_data", "visual_blueprint", "slot_mapping", "seo"] },
    seo: { titleField: "title" },
    starterPackPolicy: { mode: "page" },
    surfacePolicy: { allowedSurfaces: ["canvas", "structured"] },
  };
}

export function buildManagementReusableBlockModelContract(
  input: ManagementReusableBlockModelContractInput = {},
): openapi.ContentModelDefinitionContract {
  const singularKey = normalizeNonEmptyString(input.singularKey, DEFAULT_REUSABLE_BLOCK_MODEL_KEY);
  return {
    singularKey,
    pluralKey: normalizeNonEmptyString(input.pluralKey, `${singularKey}s`),
    name: normalizeNonEmptyString(input.name, "Reusable Block"),
    description:
      input.description ??
      "Reusable visual block for page sections, layout fragments, and AI-assisted composition.",
    category: "site_builder",
    modelKind: "collection_type",
    defaultEditor: "visual",
    defaultRole: "reusable-section",
    defaultPosture: "composition",
    defaultSurface: "canvas",
    capabilities: [
      "versioned",
      "queryable",
      "visual_editable",
      "has_slots",
      "publishable",
      "localizable",
    ],
    fields: input.fields
      ? [...input.fields]
      : [
          { key: "title", label: "Title", scalar: "text", required: true },
          { key: "sectionKey", label: "Section key", scalar: "text", required: true },
          { key: "propsDefaults", label: "Props defaults", scalar: "json", required: false },
        ],
    relations: [],
    routing: { mode: "none" },
    workflow: { states: ["draft", "published"], initialState: "draft" },
    views: [
      {
        key: "blocks",
        label: "Reusable blocks",
        type: "table",
        config: { columns: ["title", "sectionKey"] },
      },
    ],
    presentation: { allowedKinds: ["form_data", "visual_blueprint", "slot_mapping"] },
    starterPackPolicy: { mode: "section" },
    surfacePolicy: { allowedSurfaces: ["canvas", "structured"] },
  };
}

export function buildManagementProjectSiteSettingsPatch(
  input: ManagementProjectSiteSettingsPatchInput,
): openapi.ProjectSettingsPatch {
  const patch: Record<string, openapi.JsonValueInput> = {};
  if (input.site) {
    patch.site = compactJsonObject({
      contact_email: input.site.contactEmail,
      description: input.site.description,
      favicon_url: input.site.faviconUrl,
      logo_url: input.site.logoUrl,
      name: input.site.name,
      subtitle: input.site.subtitle,
      url: input.site.url,
    });
  }
  if (input.localization) {
    patch.site_localization = compactJsonObject({
      date_format: input.localization.dateFormat,
      default_locale: input.localization.defaultLocale,
      fallback_locale: input.localization.fallbackLocale,
      locale: input.localization.locale,
      supported_locales: input.localization.supportedLocales
        ? [...input.localization.supportedLocales]
        : undefined,
      timezone: input.localization.timezone,
    });
  }
  if (input.seo) {
    patch.seo = compactJsonObject({
      default_description: input.seo.defaultDescription,
      default_title: input.seo.defaultTitle,
      og_image_asset_id: input.seo.ogImageAssetId,
      og_image_url: input.seo.ogImageUrl,
      robots_directive: input.seo.robotsDirective,
      sitemap_enabled: input.seo.sitemapEnabled,
      title_policy_v1: input.seo.titlePolicyV1,
    });
  }
  if (input.analytics?.googleAnalytics) {
    patch.analytics = {
      google_analytics: compactJsonObject({
        enabled: input.analytics.googleAnalytics.enabled,
        measurement_id: input.analytics.googleAnalytics.measurementId,
      }),
    };
  }
  if (input.source) {
    patch.project_source = {
      artifact_strategy: input.source.artifactStrategy ?? "object_storage",
      build_command: input.source.buildCommand ?? "pnpm build",
      framework: input.source.framework ?? "react_vite",
      output_directory: input.source.outputDirectory ?? "dist",
      package_manager: input.source.packageManager ?? "pnpm",
      root_directory: input.source.rootDirectory ?? ".",
      source_provider: input.source.sourceProvider ?? "managed",
    };
  }
  return { patch };
}

export function buildManagementProjectSourceSettingsPatch(
  input: ManagementProjectSourceSettingsPatchInput,
): openapi.ProjectSettingsPatch {
  return {
    patch: {
      project_source: compactJsonObject({
        artifact_strategy: input.artifactStrategy,
        build_command: input.buildCommand,
        framework: input.framework,
        output_directory: input.outputDirectory,
        package_manager: input.packageManager,
        root_directory: input.rootDirectory,
        source_provider: input.sourceProvider,
      }),
    },
  };
}

function splitManagementProjectSiteSettingsPatchInput(
  input: ManagementProjectSiteSettingsPatchInput,
): {
  publicSettings?: ManagementProjectSiteSettingsPatchInput;
  sourceSettings?: ManagementProjectSourceSettingsPatchInput;
} {
  const publicSettings: ManagementProjectSiteSettingsPatchInput = {
    ...(input.analytics ? { analytics: input.analytics } : {}),
    ...(input.localization ? { localization: input.localization } : {}),
    ...(input.seo ? { seo: input.seo } : {}),
    ...(input.site ? { site: input.site } : {}),
  };
  return {
    ...(Object.keys(publicSettings).length > 0 ? { publicSettings } : {}),
    ...(input.source ? { sourceSettings: input.source } : {}),
  };
}

function compactJsonObject(
  value: Record<string, openapi.JsonValueInput | readonly string[] | undefined>,
): Record<string, openapi.JsonValueInput> {
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, openapi.JsonValueInput] => {
      return entry[1] !== undefined;
    }),
  );
}

function readObjectString(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object" || !(key in value)) return null;
  const current = (value as Record<string, unknown>)[key];
  return typeof current === "string" && current.trim() ? current : null;
}

function readObjectArrayLength(value: unknown, key: string): number | null {
  if (!value || typeof value !== "object" || !(key in value)) return null;
  const current = (value as Record<string, unknown>)[key];
  return Array.isArray(current) ? current.length : null;
}

function getContentPresentationPayload(
  version: openapi.ContentVersionOut,
  kind: openapi.ContentPresentationOut["kind"],
): Record<string, unknown> | null {
  const payload = version.presentations?.find(
    (presentation) => presentation.kind === kind,
  )?.payload;
  return payload && typeof payload === "object" ? payload : null;
}

function readContentVersionString(
  version: openapi.ContentVersionOut,
  keys: readonly string[],
): string | null {
  const formData = getContentPresentationPayload(version, "form_data");
  for (const key of keys) {
    const value = readObjectString(version.fieldsSnapshot, key) ?? readObjectString(formData, key);
    if (value) return value;
  }
  return null;
}

function selectHomepageItem(
  items: readonly openapi.ContentItemOut[],
): openapi.ContentItemOut | null {
  const pages = items.filter(
    (item) =>
      item.modelKey === DEFAULT_SITE_PAGE_MODEL_KEY ||
      item.role === "page" ||
      item.resolvedRole === "page" ||
      item.resolvedPosture === "page",
  );
  if (!pages.length) return null;

  return (
    pages.find((item) => item.slug === "home" || item.slug === "homepage") ??
    pages.find((item) => item.title?.trim().toLowerCase() === "home") ??
    pages.find((item) => item.publishedVersion !== null && item.publishedVersion !== undefined) ??
    pages[0] ??
    null
  );
}

function resolveHomepageVersionNumber(
  item: openapi.ContentItemOut,
  version: ManagementProjectHomepageLookupInput["version"] | undefined,
): number | null {
  if (version === "published") return item.publishedVersion ?? null;
  if (Number.isFinite(item.draftVersion) && Number(item.draftVersion) > 0) {
    return Number(item.draftVersion);
  }
  return item.publishedVersion ?? null;
}

function buildHomepageSnapshot(input: {
  item: openapi.ContentItemOut;
  modelKey: string;
  version: ManagementResult<openapi.ContentVersionOut>;
}): ManagementProjectHomepageSnapshot {
  const formData = getContentPresentationPayload(input.version.data, "form_data");
  return {
    heroHeadline: readContentVersionString(input.version.data, ["heroHeadline", "headline"]),
    heroSubheading: readContentVersionString(input.version.data, [
      "heroSubheading",
      "subheading",
      "description",
    ]),
    item: input.item,
    modelKey: input.modelKey,
    path: readContentVersionString(input.version.data, ["path", "routePath", "slug"]),
    sectionsCount:
      readObjectArrayLength(input.version.data.fieldsSnapshot, "sections") ??
      readObjectArrayLength(formData, "sections"),
    title:
      readContentVersionString(input.version.data, ["title"]) ??
      input.item.title ??
      input.item.slug,
    version: input.version,
  };
}

function createManagementProjectSourceTreeNode(input: {
  file?: openapi.ProjectSourceFileOut | null;
  name: string;
  path: string;
  type: "directory" | "file";
}): MutableManagementProjectSourceTreeNode {
  return {
    children: [],
    file: input.file ?? null,
    name: input.name,
    path: input.path,
    type: input.type,
  };
}

function sortManagementProjectSourceTreeNodes(
  nodes: readonly MutableManagementProjectSourceTreeNode[],
): readonly ManagementProjectSourceTreeNode[] {
  return [...nodes]
    .map((node) =>
      Object.assign({}, node, { children: sortManagementProjectSourceTreeNodes(node.children) }),
    )
    .sort((left, right) => {
      if (left.type !== right.type) return left.type === "directory" ? -1 : 1;
      return left.name.localeCompare(right.name);
    });
}

export function buildManagementProjectSourceTree(
  files: readonly openapi.ProjectSourceFileOut[],
): readonly ManagementProjectSourceTreeNode[] {
  const root = createManagementProjectSourceTreeNode({ name: "", path: "", type: "directory" });

  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    let current = root;

    for (const [index, part] of parts.entries()) {
      const isFile = index === parts.length - 1;
      const path = parts.slice(0, index + 1).join("/");
      let next = current.children.find((node) => node.name === part && node.path === path);
      if (!next) {
        next = createManagementProjectSourceTreeNode({
          file: isFile ? file : null,
          name: part,
          path,
          type: isFile ? "file" : "directory",
        });
        current.children.push(next);
      }
      if (isFile) {
        next.file = file;
      }
      current = next;
    }
  }

  return sortManagementProjectSourceTreeNodes(root.children);
}

function groupManagementProjectSourceFilesByRole(
  files: readonly openapi.ProjectSourceFileOut[],
): ManagementProjectSourceFilesByRole {
  const grouped: Partial<Record<ManagementProjectSourceFileRole, openapi.ProjectSourceFileOut[]>> =
    {};
  for (const file of files) {
    if (!file.role) continue;
    const role = file.role;
    grouped[role] = [...(grouped[role] ?? []), file];
  }
  return grouped;
}

function selectManagementProjectAppEntryFile(
  files: readonly openapi.ProjectSourceFileOut[],
  framework: openapi.ProjectSourceManifestOut["framework"],
): openapi.ProjectSourceFileOut | null {
  const preferredPaths =
    framework === "astro"
      ? ["src/pages/index.astro", "src/components/ReactIsland.tsx", "src/App.tsx"]
      : ["src/App.tsx", "src/main.tsx", "src/pages/index.astro"];
  return (
    preferredPaths.map((path) => files.find((file) => file.path === path)).find(Boolean) ??
    files.find((file) => file.role === "entry") ??
    null
  );
}

export function buildManagementProjectSourceStructure(
  manifest: openapi.ProjectSourceManifestOut,
): ManagementProjectSourceStructure {
  const files = manifest.files ?? [];
  const filesByRole = groupManagementProjectSourceFilesByRole(files);
  return {
    appEntryFile: selectManagementProjectAppEntryFile(files, manifest.framework),
    configFile: files.find((file) => file.path === "src/arclayer/site-config.ts") ?? null,
    contentFiles: filesByRole.content ?? [],
    filesByRole,
    manifest,
    runtimeFiles: filesByRole.runtime ?? [],
    tree: buildManagementProjectSourceTree(files),
  };
}

function buildManagementProjectSourceStructureResult(
  manifest: ManagementResult<openapi.ProjectSourceManifestOut>,
): ManagementResult<ManagementProjectSourceStructure> {
  return {
    ...manifest,
    data: buildManagementProjectSourceStructure(manifest.data),
  };
}

export function readManagementWorkspaceActionSiteStructure(
  response: Pick<openapi.WorkspaceAiActionResponse, "toolCalls">,
): ManagementWorkspaceActionSiteStructure | null {
  const siteStructureToolCall = response.toolCalls?.find(
    (toolCall) => toolCall.toolName === "workspace.create_site_structure",
  );
  if (!siteStructureToolCall) return null;
  const args = siteStructureToolCall.arguments ?? {};
  const componentBindings = readManagementWorkspaceActionComponentBindings(args.componentBindings);
  return {
    componentBindingCount: componentBindings.length,
    componentBindings,
    hierarchyNodeCount: readManagementWorkspaceActionNumber(args.hierarchyNodeCount),
    hierarchyRootItemId: readManagementWorkspaceActionString(args.hierarchyRootItemId),
    routePath: readManagementWorkspaceActionString(args.routePath),
  };
}

export function readManagementWorkspaceActionReleaseSummary(
  response: Pick<openapi.WorkspaceAiActionResponse, "toolCalls">,
): ManagementWorkspaceActionReleaseSummary | null {
  const releaseToolCall = response.toolCalls?.find(
    (toolCall) => toolCall.toolName === "workspace.publish_project_release",
  );
  if (!releaseToolCall) return null;
  const args = releaseToolCall.arguments ?? {};
  return {
    releaseId: readManagementWorkspaceActionString(args.releaseId),
    releaseNumber: readManagementWorkspaceActionNumber(args.releaseNumber),
    selectionCount: readManagementWorkspaceActionNumber(args.selectionCount),
  };
}

function readManagementWorkspaceActionComponentBindings(
  value: unknown,
): ManagementWorkspaceActionComponentBinding[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): ManagementWorkspaceActionComponentBinding[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const componentKey = readManagementWorkspaceActionString(record.componentKey);
    const bindingKey = readManagementWorkspaceActionString(record.bindingKey);
    if (!componentKey || !bindingKey) return [];
    const payload = record.payload;
    return [
      {
        bindingKey,
        componentKey,
        ...(payload && typeof payload === "object" && !Array.isArray(payload)
          ? { payload: payload as Record<string, openapi.JsonValueOutput> }
          : {}),
      },
    ];
  });
}

function readManagementWorkspaceActionNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readManagementWorkspaceActionString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function readJsonRecord(value: unknown): Record<string, openapi.JsonValueInput> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, openapi.JsonValueInput>;
}

async function findHomepage(params: {
  input?: ManagementProjectHomepageLookupInput;
  projectId: string;
  sdk: ManagementSdk;
}): Promise<ManagementProjectHomepageSnapshot | null> {
  const requestedModelKey = params.input?.modelKey?.trim();
  let modelKey = requestedModelKey || DEFAULT_SITE_PAGE_MODEL_KEY;
  if (!requestedModelKey) {
    const models = await params.sdk.content.models.list({
      category: "site_builder",
      page: 1,
      projectId: params.projectId,
      size: 200,
    });
    modelKey =
      models.items.find(isManagementSitePageModel)?.singularKey ?? DEFAULT_SITE_PAGE_MODEL_KEY;
  }
  const items = await params.sdk.content.items.list({
    modelKey,
    page: 1,
    projectId: params.projectId,
    size: 200,
  });
  const homepage = selectHomepageItem(items.items);
  if (!homepage) return null;

  const versionNumber = resolveHomepageVersionNumber(homepage, params.input?.version);
  if (!versionNumber) return null;

  const version = await params.sdk.content.items.versions.get({
    itemId: homepage.id,
    projectId: params.projectId,
    versionNumber,
  });
  return buildHomepageSnapshot({ item: homepage, modelKey, version });
}

async function updateHomepageDraft(params: {
  input?: ManagementProjectHomepageUpdateInput;
  projectId: string;
  sdk: ManagementSdk;
}): Promise<ManagementProjectHomepageUpdate> {
  const homepage = await findHomepage({
    input: {
      modelKey: params.input?.modelKey,
      version: "draft",
    },
    projectId: params.projectId,
    sdk: params.sdk,
  });
  if (!homepage) {
    throw new Error("MANAGEMENT_SDK_HOMEPAGE_REQUIRED");
  }

  return saveHomepageSnapshotDraft({
    homepage,
    input: params.input,
    projectId: params.projectId,
    sdk: params.sdk,
  });
}

async function updateEnterpriseLandingPage(params: {
  input?: ManagementEnterpriseLandingPageUpdateInput;
  projectId: string;
  sdk: ManagementSdk;
}): Promise<ManagementEnterpriseLandingPageUpdate> {
  const siteSettings = params.input?.siteSettings
    ? splitManagementProjectSiteSettingsPatchInput(params.input.siteSettings)
    : {};
  const settings = siteSettings.publicSettings
    ? await params.sdk.site.patchCoreSettings({
        body: buildManagementProjectSiteSettingsPatch(siteSettings.publicSettings),
        projectId: params.projectId,
      })
    : undefined;
  const sourceSettings = siteSettings.sourceSettings
    ? await params.sdk.source.updateSettings({
        ...siteSettings.sourceSettings,
        projectId: params.projectId,
      })
    : undefined;
  const sourceOperations = params.input?.sourceOperations ?? [];
  const sourceManifest =
    sourceOperations.length > 0
      ? await params.sdk.source.applyPatch({
          operations: sourceOperations,
          projectId: params.projectId,
        })
      : undefined;
  const homepage =
    params.input?.fields ||
    params.input?.path !== undefined ||
    params.input?.title !== undefined ||
    params.input?.publishHomepage === true
      ? await updateHomepageDraft({
          input: {
            changeSummary: params.input?.changeSummary ?? "Update enterprise landing page.",
            expectedVersion: params.input?.expectedVersion,
            fields: params.input?.fields,
            modelKey: params.input?.modelKey,
            path: params.input?.path,
            publish: params.input?.publishHomepage,
            title: params.input?.title,
          },
          projectId: params.projectId,
          sdk: params.sdk,
        })
      : undefined;
  const releaseDryRun = await params.sdk.releases.dryRun({ projectId: params.projectId });
  const release =
    params.input?.publishRelease === true
      ? await params.sdk.releases.publish({
          body: params.input.releaseBody ?? null,
          projectId: params.projectId,
        })
      : undefined;
  const sourceStructure = sourceManifest
    ? buildManagementProjectSourceStructureResult(sourceManifest)
    : undefined;

  return {
    ...(homepage ? { homepage } : {}),
    ...(release ? { release } : {}),
    releaseDryRun,
    ...(settings ? { settings } : {}),
    ...(sourceManifest ? { sourceManifest } : {}),
    ...(sourceSettings ? { sourceSettings } : {}),
    ...(sourceStructure ? { sourceStructure } : {}),
  };
}

async function saveHomepageSnapshotDraft(params: {
  homepage: ManagementProjectHomepageSnapshot;
  input?: ManagementProjectHomepageUpdateInput;
  projectId: string;
  sdk: ManagementSdk;
}): Promise<ManagementProjectHomepageUpdate> {
  const fieldsSnapshot: Record<string, openapi.JsonValueInput> = {
    ...readJsonRecord(params.homepage.version.data.fieldsSnapshot),
    ...params.input?.fields,
  };
  if (params.input?.path !== undefined) fieldsSnapshot.path = params.input.path;
  if (params.input?.title !== undefined) fieldsSnapshot.title = params.input.title;

  const draftVersion = await params.sdk.content.items.saveDraft({
    body: {
      expectedVersion: params.input?.expectedVersion ?? params.homepage.version.data.versionNumber,
      changeSummary: params.input?.changeSummary ?? "Update homepage route content.",
      fieldsSnapshot,
      presentations: [
        {
          kind: "form_data",
          payload: fieldsSnapshot,
        },
      ],
    },
    itemId: params.homepage.item.id,
    projectId: params.projectId,
  });
  const publishedVersion =
    params.input?.publish === true
      ? await params.sdk.content.items.publishVersion({
          itemId: params.homepage.item.id,
          projectId: params.projectId,
          versionNumber: draftVersion.data.versionNumber,
        })
      : undefined;

  return {
    draftVersion,
    item: params.homepage.item,
    modelKey: params.homepage.modelKey,
    path: readContentVersionString(draftVersion.data, ["path", "routePath", "slug"]),
    previousVersion: params.homepage.version,
    ...(publishedVersion ? { publishedVersion } : {}),
  };
}

function contentItemResultFromDraft(
  item: openapi.ContentItemOut,
  draftVersion: ManagementResult<openapi.ContentVersionOut>,
): ManagementResult<openapi.ContentItemOut> {
  return {
    data: item,
    message: draftVersion.message,
    meta: draftVersion.meta,
    requestId: draftVersion.requestId,
    status: draftVersion.status,
    timestamp: draftVersion.timestamp,
  };
}

async function bootstrapHomepageDraft(params: {
  input?: ManagementProjectHomepageDraftInput;
  projectId: string;
  sdk: ManagementSdk;
}): Promise<ManagementProjectHomepageDraft> {
  const existingHomepage = await findHomepage({
    input: {
      modelKey: params.input?.modelKey,
      version: "draft",
    },
    projectId: params.projectId,
    sdk: params.sdk,
  });
  if (!existingHomepage) {
    return createHomepageDraft(params);
  }

  const updated = await saveHomepageSnapshotDraft({
    homepage: existingHomepage,
    input: {
      changeSummary: "Seed homepage route content.",
      fields: params.input?.fields,
      path: params.input?.path ?? DEFAULT_HOMEPAGE_PATH,
      publish: params.input?.publish,
      title: params.input?.title ?? DEFAULT_HOMEPAGE_TITLE,
    },
    projectId: params.projectId,
    sdk: params.sdk,
  });

  return {
    draftVersion: updated.draftVersion,
    item: contentItemResultFromDraft(updated.item, updated.draftVersion),
    modelKey: updated.modelKey,
    path: updated.path ?? params.input?.path ?? DEFAULT_HOMEPAGE_PATH,
    ...(updated.publishedVersion ? { publishedVersion: updated.publishedVersion } : {}),
  };
}

async function updateContentItemFields(params: {
  input: ManagementContentFieldsUpdateInput;
  sdk: ManagementSdk;
}): Promise<ManagementContentFieldsUpdate> {
  const fieldsSnapshot = { ...params.input.fields };
  const draftVersion = await params.sdk.content.items.saveDraft({
    body: {
      expectedVersion: params.input.expectedVersion,
      changeSummary: params.input.changeSummary ?? DEFAULT_CONTENT_FIELDS_CHANGE_SUMMARY,
      fieldsSnapshot,
      presentations: [
        {
          kind: "form_data",
          payload: fieldsSnapshot,
        },
      ],
    },
    itemId: params.input.itemId,
    projectId: params.input.projectId,
  });
  const publishedVersion =
    params.input.publish === true
      ? await params.sdk.content.items.publishVersion({
          itemId: params.input.itemId,
          projectId: params.input.projectId,
          versionNumber: draftVersion.data.versionNumber,
        })
      : undefined;

  return {
    draftVersion,
    ...(publishedVersion ? { publishedVersion } : {}),
  };
}

async function updateContentModelWithAi(params: {
  input: ManagementContentModelAiUpdateInput;
  sdk: ManagementSdk;
}): Promise<ManagementResult<openapi.WorkspaceAiActionResponse>> {
  return params.sdk.ai.executeWorkspaceAction({
    body: {
      message: params.input.message ?? buildContentModelAiUpdateMessage(params.input),
      mode: "build",
      projectId: params.input.projectId,
      workspaceId: params.input.workspaceId,
    } as openapi.WorkspaceAiActionRequest,
  });
}

function buildContentModelAiUpdateMessage(input: ManagementContentModelAiUpdateInput): string {
  const payload = {
    modelId: input.modelId,
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.fieldMutations?.length ? { fieldMutations: input.fieldMutations } : {}),
    ...(input.fieldOrder?.length ? { fieldOrder: input.fieldOrder } : {}),
  };
  return [
    "Update this content model through workspace_update_content_model.",
    "Use the exact JSON arguments below for the workspace tool call.",
    JSON.stringify(payload),
  ].join("\n");
}

async function resolveSitePageModelKey(params: {
  input?: ManagementProjectHomepageDraftInput;
  projectId: string;
  sdk: ManagementSdk;
}): Promise<string> {
  const requestedModelKey = params.input?.modelKey?.trim();
  if (requestedModelKey) return requestedModelKey;

  const models = await params.sdk.content.models.list({
    category: "site_builder",
    page: 1,
    projectId: params.projectId,
    size: 200,
  });
  const existingPageModel = models.items.find(isManagementSitePageModel);
  if (existingPageModel) return existingPageModel.singularKey;

  if (params.input?.ensurePageModel === false) {
    throw new Error("MANAGEMENT_SDK_SITE_PAGE_MODEL_REQUIRED");
  }

  const createdModel = await params.sdk.content.models.create({
    body: buildManagementSitePageModelContract(),
    projectId: params.projectId,
  });
  return createdModel.data.singularKey;
}

async function createHomepageDraft(params: {
  input?: ManagementProjectHomepageDraftInput;
  projectId: string;
  sdk: ManagementSdk;
}): Promise<ManagementProjectHomepageDraft> {
  const title = normalizeNonEmptyString(params.input?.title, DEFAULT_HOMEPAGE_TITLE);
  const path = normalizeNonEmptyString(params.input?.path, DEFAULT_HOMEPAGE_PATH);
  const modelKey = await resolveSitePageModelKey(params);
  const item = await params.sdk.content.items.create({
    body: {
      ...(params.input?.locale ? { locale: params.input.locale } : {}),
      modelKey,
      title,
    },
    projectId: params.projectId,
  });
  const fieldsSnapshot = {
    ...params.input?.fields,
    path,
    title,
  };
  const draftVersion = await params.sdk.content.items.saveDraft({
    body: {
      expectedVersion: item.data.draftVersion ?? 0,
      changeSummary: "Seed homepage route content.",
      fieldsSnapshot,
      presentations: [
        {
          kind: "form_data",
          payload: fieldsSnapshot,
        },
      ],
    },
    itemId: item.data.id,
    projectId: params.projectId,
  });
  const publishedVersion =
    params.input?.publish === true
      ? await params.sdk.content.items.publishVersion({
          itemId: item.data.id,
          projectId: params.projectId,
          versionNumber: draftVersion.data.versionNumber,
        })
      : undefined;

  return {
    draftVersion,
    item,
    modelKey,
    path,
    ...(publishedVersion ? { publishedVersion } : {}),
  };
}

async function ensureReusableBlockModel(params: {
  input?: ManagementProjectBootstrapSiteInput;
  projectId: string;
  sdk: ManagementSdk;
}): Promise<string | undefined> {
  if (params.input?.ensureReusableBlockModel === false) return undefined;

  const models = await params.sdk.content.models.list({
    category: "site_builder",
    page: 1,
    projectId: params.projectId,
    size: 200,
  });
  const existingReusableBlockModel = models.items.find(isManagementReusableBlockModel);
  if (existingReusableBlockModel) return existingReusableBlockModel.singularKey;

  const createdModel = await params.sdk.content.models.create({
    body: buildManagementReusableBlockModelContract(),
    projectId: params.projectId,
  });
  return createdModel.data.singularKey;
}

async function bootstrapSite(params: {
  input?: ManagementProjectBootstrapSiteInput;
  projectId: string;
  sdk: ManagementSdk;
}): Promise<ManagementProjectBootstrapSite> {
  const homepage = await bootstrapHomepageDraft({
    input: params.input?.homepage,
    projectId: params.projectId,
    sdk: params.sdk,
  });
  const reusableBlockModelKey = await ensureReusableBlockModel({
    input: params.input,
    projectId: params.projectId,
    sdk: params.sdk,
  });
  const sourceOperations = params.input?.sourceOperations ?? [];
  const sourceManifest =
    sourceOperations.length > 0
      ? await params.sdk.source.applyPatch({
          operations: sourceOperations,
          projectId: params.projectId,
        })
      : await params.sdk.source.getManifest({ projectId: params.projectId });
  const [routeBindings, hierarchyNodes, homepageComponentBindings] = await Promise.all([
    params.sdk.content.routing.listBindings({ projectId: params.projectId }),
    params.sdk.content.routing.listHierarchyNodes({ projectId: params.projectId }),
    params.sdk.content.items.versions.listComponentBindings({
      itemId: homepage.item.data.id,
      projectId: params.projectId,
      versionNumber: homepage.draftVersion.data.versionNumber,
    }),
  ]);
  const releaseDryRun = await params.sdk.releases.dryRun({ projectId: params.projectId });
  const release =
    params.input?.publishRelease === true
      ? await params.sdk.releases.publish({ projectId: params.projectId })
      : undefined;

  return {
    homepageComponentBindings,
    homepage,
    hierarchyNodes,
    releaseDryRun,
    ...(reusableBlockModelKey ? { reusableBlockModelKey } : {}),
    routeBindings,
    sourceManifest,
    ...(release ? { release } : {}),
  };
}

function enterpriseLandingProjectPrompt(input: ManagementEnterpriseLandingSiteCreateInput): string {
  const frameworkLabel =
    input.framework === "astro"
      ? "Astro source tree with React islands"
      : "React and Vite source tree";
  return (
    input.projectPrompt?.trim() ||
    `Create a real enterprise landing site project for ${input.brandName} with a readable ${frameworkLabel}, homepage content, SEO defaults, and a preview domain.`
  );
}

function selectManagementPrimaryDomain(
  domains: readonly openapi.DomainBindingOut[],
): openapi.DomainBindingOut | null {
  return (
    domains.find((domain) => domain.isPrimary && domain.isActive) ??
    domains.find((domain) => domain.isActive && domain.isVerified) ??
    domains.find((domain) => domain.isPrimary) ??
    domains[0] ??
    null
  );
}

function createEnterpriseLandingSiteSummary(input: {
  bootstrap: ManagementProjectBootstrapSite;
  createProjectAction: ManagementResult<openapi.WorkspaceAiActionResponse>;
  createProjectSiteStructure: ManagementWorkspaceActionSiteStructure | null;
  primaryDomain: openapi.DomainBindingOut | null;
  projectId: string;
  sourceStructure: ManagementResult<ManagementProjectSourceStructure>;
}): ManagementEnterpriseLandingSiteSummary {
  const { bootstrap, createProjectAction, createProjectSiteStructure, primaryDomain } = input;
  const createProjectRelease = readManagementWorkspaceActionReleaseSummary(
    createProjectAction.data,
  );
  return {
    appEntryPath: input.sourceStructure.data.appEntryFile?.path ?? null,
    componentBindingCount:
      createProjectSiteStructure?.componentBindingCount ??
      bootstrap.homepageComponentBindings.data.items?.length ??
      0,
    editorPath: `/projects/${input.projectId}/editor`,
    homepageItemId: bootstrap.homepage.item.data.id ?? null,
    hierarchyNodeCount:
      createProjectSiteStructure?.hierarchyNodeCount ?? bootstrap.hierarchyNodes.data.length,
    primaryDomainHostname: primaryDomain?.hostname ?? null,
    projectId: input.projectId,
    releaseNumber:
      bootstrap.release?.data.release.releaseNumber ?? createProjectRelease?.releaseNumber ?? null,
    releaseReady: bootstrap.releaseDryRun.data.readinessSummary.ready ?? null,
    routePath:
      createProjectSiteStructure?.routePath ?? bootstrap.routeBindings.data[0]?.path ?? null,
    sourceFileCount: input.sourceStructure.data.manifest.files?.length ?? 0,
  };
}

async function createEnterpriseLandingSite(params: {
  input: ManagementEnterpriseLandingSiteCreateInput;
  sdk: ManagementSdk;
}): Promise<ManagementEnterpriseLandingSiteCreateResult> {
  const createProjectAction = await params.sdk.ai.executeWorkspaceAction({
    body: {
      message: enterpriseLandingProjectPrompt(params.input),
      mode: "build",
      workspaceId: params.input.workspaceId,
    },
  });
  const createProjectSiteStructure = readManagementWorkspaceActionSiteStructure(
    createProjectAction.data,
  );
  const projectId = createProjectAction.data.project?.id;
  if (!projectId) {
    throw new Error("MANAGEMENT_ENTERPRISE_LANDING_PROJECT_ID_REQUIRED");
  }

  const project = params.sdk.forProject(projectId);
  const locale = normalizeNonEmptyString(params.input.locale, "en-US");
  const settings = await project.site.patchCoreSettings({
    body: buildManagementProjectSiteSettingsPatch({
      analytics: params.input.googleAnalyticsMeasurementId
        ? {
            googleAnalytics: {
              enabled: true,
              measurementId: params.input.googleAnalyticsMeasurementId,
            },
          }
        : undefined,
      localization: {
        dateFormat: "YYYY-MM-DD",
        defaultLocale: locale,
        fallbackLocale: locale,
        locale,
        supportedLocales: [locale],
        timezone: normalizeNonEmptyString(params.input.timezone, "UTC"),
      },
      seo: {
        defaultDescription: params.input.description,
        defaultTitle: params.input.brandName,
        ogImageUrl: params.input.socialImageUrl ?? null,
        robotsDirective: "index,follow",
        sitemapEnabled: true,
        titlePolicyV1: {
          dedupe: true,
          home_mode: "siteOnly",
          parts: [
            { kind: "token", value: "pageTitle" },
            { kind: "literal", value: " | " },
            { kind: "token", value: "siteName" },
          ],
        },
      },
      site: {
        contactEmail: params.input.contactEmail ?? null,
        description: params.input.description,
        faviconUrl: params.input.faviconUrl ?? null,
        logoUrl: params.input.logoUrl ?? null,
        name: params.input.brandName,
        url: params.input.canonicalUrl ?? undefined,
      },
    }),
  });
  const sourceSettings = await project.source.updateSettings({
    framework: params.input.framework ?? "react_vite",
  });

  const sections = params.input.sections ?? [];
  const bootstrap = await project.site.bootstrapSite({
    homepage: {
      fields: {
        canonicalUrl: params.input.canonicalUrl ?? null,
        heroHeadline: params.input.heroHeadline ?? `${params.input.brandName} is ready to launch.`,
        heroSubheading: params.input.heroSubheading ?? params.input.description,
        primaryCtaLabel: params.input.primaryCtaLabel ?? "Get started",
        secondaryCtaLabel: params.input.secondaryCtaLabel ?? "Explore services",
        sections: sections.map((section) => Object.assign({}, section)),
      },
      locale,
      path: "/",
      publish: true,
      title: "Home",
    },
    publishRelease: params.input.publishRelease ?? true,
  });
  const sourceStructure = buildManagementProjectSourceStructureResult(bootstrap.sourceManifest);
  const contentModels = await project.content.models.list({ page: 1, size: 100 });
  const domains = await project.domains.list({ page: 1, size: 100 });
  const primaryDomain = selectManagementPrimaryDomain(domains.items);
  const summary = createEnterpriseLandingSiteSummary({
    bootstrap,
    createProjectAction,
    createProjectSiteStructure,
    primaryDomain,
    projectId,
    sourceStructure,
  });

  return {
    bootstrap,
    contentModels,
    createProjectAction,
    createProjectSiteStructure,
    domains,
    primaryDomain,
    project,
    projectId,
    settings,
    sourceSettings,
    sourceStructure,
    summary,
  };
}

const createProjectSdk = (sdk: ManagementSdk, projectId: string): ManagementProjectSdk => ({
  projectId,
  getOverview: async () => {
    const [coreSettings, site, sourceManifest, releases, domains] = await Promise.all([
      sdk.site.getCoreSettings({ projectId }),
      sdk.site.get({ projectId }),
      sdk.source.getManifest({ projectId }),
      sdk.releases.list({ projectId }),
      sdk.domains.list({ projectId }),
    ]);
    return {
      coreSettings,
      domains,
      projectId,
      releases,
      site,
      sourceManifest,
      sourceStructure: buildManagementProjectSourceStructureResult(sourceManifest),
    };
  },
  ai: {
    executeWorkspaceAction: ({ body }) =>
      sdk.ai.executeWorkspaceAction({
        body: {
          ...body,
          projectId,
        },
      }),
  },
  content: {
    items: {
      applyBootstrapShape: (input) =>
        sdk.content.items.applyBootstrapShape({ ...input, projectId }),
      archive: (input) => sdk.content.items.archive({ ...input, projectId }),
      create: (input) => sdk.content.items.create({ ...input, projectId }),
      delete: (input) => sdk.content.items.delete({ ...input, projectId }),
      duplicate: (input) => sdk.content.items.duplicate({ ...input, projectId }),
      get: (input) => sdk.content.items.get({ ...input, projectId }),
      list: (input = {}) => sdk.content.items.list({ ...input, projectId }),
      publishVersion: (input) => sdk.content.items.publishVersion({ ...input, projectId }),
      saveDraft: (input) => sdk.content.items.saveDraft({ ...input, projectId }),
      updateFields: (input) => sdk.content.items.updateFields({ ...input, projectId }),
      versions: {
        get: (input) => sdk.content.items.versions.get({ ...input, projectId }),
        getSeoProfile: (input) => sdk.content.items.versions.getSeoProfile({ ...input, projectId }),
        list: (input) => sdk.content.items.versions.list({ ...input, projectId }),
        listComponentBindings: (input) =>
          sdk.content.items.versions.listComponentBindings({ ...input, projectId }),
        listPresentations: (input) =>
          sdk.content.items.versions.listPresentations({ ...input, projectId }),
        patch: (input) => sdk.content.items.versions.patch({ ...input, projectId }),
        publish: (input) => sdk.content.items.versions.publish({ ...input, projectId }),
        saveDraft: (input) => sdk.content.items.versions.saveDraft({ ...input, projectId }),
      },
      unarchive: (input) => sdk.content.items.unarchive({ ...input, projectId }),
    },
    models: {
      create: (input) => sdk.content.models.create({ ...input, projectId }),
      delete: (input) => sdk.content.models.delete({ ...input, projectId }),
      fields: {
        create: (input) => sdk.content.models.fields.create({ ...input, projectId }),
        delete: (input) => sdk.content.models.fields.delete({ ...input, projectId }),
        reorder: (input) => sdk.content.models.fields.reorder({ ...input, projectId }),
        update: (input) => sdk.content.models.fields.update({ ...input, projectId }),
      },
      list: (input = {}) => sdk.content.models.list({ ...input, projectId }),
      getJsonPreview: (input) => sdk.content.models.getJsonPreview({ ...input, projectId }),
      listFieldTypes: () => sdk.content.models.listFieldTypes({ projectId }),
      previewUpdate: (input) => sdk.content.models.previewUpdate({ ...input, projectId }),
      update: (input) => sdk.content.models.update({ ...input, projectId }),
      updateWithAi: (input) => sdk.content.models.updateWithAi({ ...input, projectId }),
    },
    routing: {
      listBindings: () => sdk.content.routing.listBindings({ projectId }),
      listHierarchyNodes: () => sdk.content.routing.listHierarchyNodes({ projectId }),
      upsertBinding: (input) => sdk.content.routing.upsertBinding({ ...input, projectId }),
      upsertHierarchyNode: (input) =>
        sdk.content.routing.upsertHierarchyNode({ ...input, projectId }),
    },
  },
  releases: {
    dryRun: () => sdk.releases.dryRun({ projectId }),
    get: (input) => sdk.releases.get({ ...input, projectId }),
    list: () => sdk.releases.list({ projectId }),
    publish: (input) => sdk.releases.publish({ ...input, projectId }),
    publishImpact: () => sdk.releases.publishImpact({ projectId }),
    publishPreviewContract: () => sdk.releases.publishPreviewContract({ projectId }),
    rollback: (input) => sdk.releases.rollback({ ...input, projectId }),
  },
  domains: {
    create: (input) => sdk.domains.create({ ...input, projectId }),
    delete: (input) => sdk.domains.delete({ ...input, projectId }),
    list: (input = {}) => sdk.domains.list({ ...input, projectId }),
    update: (input) => sdk.domains.update({ ...input, projectId }),
    verify: (input) => sdk.domains.verify({ ...input, projectId }),
  },
  site: {
    bootstrapSite: (input) => bootstrapSite({ input, projectId, sdk }),
    createHomepageDraft: (input) => createHomepageDraft({ input, projectId, sdk }),
    findHomepage: (input) => findHomepage({ input, projectId, sdk }),
    updateHomepageDraft: (input) => updateHomepageDraft({ input, projectId, sdk }),
    updateEnterpriseLandingPage: (input) => updateEnterpriseLandingPage({ input, projectId, sdk }),
    createPreviewToken: (input) => sdk.site.createPreviewToken({ ...input, projectId }),
    get: () => sdk.site.get({ projectId }),
    getCoreSettings: () => sdk.site.getCoreSettings({ projectId }),
    patchCoreSettings: (input) => sdk.site.patchCoreSettings({ ...input, projectId }),
  },
  source: {
    applyPatch: (input) => sdk.source.applyPatch({ ...input, projectId }),
    deleteFile: (input) => sdk.source.deleteFile({ ...input, projectId }),
    getManifest: () => sdk.source.getManifest({ projectId }),
    getStructure: () => sdk.source.getStructure({ projectId }),
    readFile: (input) => sdk.source.readFile({ ...input, projectId }),
    updateSettings: (input) => sdk.source.updateSettings({ ...input, projectId }),
    upsertFile: (input) => sdk.source.upsertFile({ ...input, projectId }),
  },
});

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

  const invokeNone = async (
    operation: OpenApiOperation<null>,
    request: Record<string, unknown>,
  ): Promise<ManagementResult<null>> => {
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
    return normalizeManagementResult<null>(result.response, result.data ?? result.error, {
      allowNullData: true,
    });
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

  let sdk: ManagementSdk;

  sdk = {
    rawClient,
    ai: {
      executeWorkspaceAction: ({ body }) =>
        invoke<openapi.WorkspaceAiActionResponse>(
          openapi.aiExecuteWorkspaceAiAction as OpenApiOperation<openapi.WorkspaceAiActionResponse>,
          { body },
        ),
    },
    siteBuilder: {
      createEnterpriseLandingSite: (input) => createEnterpriseLandingSite({ input, sdk }),
    },
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
        invokeNone(openapi.domainProjectsDeleteProjectAutomationFlow as OpenApiOperation<null>, {
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
        saveDraft: ({ projectId, itemId, body }) =>
          invoke<openapi.ContentVersionOut>(
            openapi.domainProjectsSaveProjectContentItemDraftVersion as OpenApiOperation<openapi.ContentVersionOut>,
            { body, path: { item_id: itemId, project_id: projectId } },
          ),
        updateFields: (input) => updateContentItemFields({ input, sdk }),
        publishVersion: ({ projectId, itemId, versionNumber }) =>
          invoke<openapi.ContentVersionOut>(
            openapi.domainProjectsPublishProjectContentItemVersion as OpenApiOperation<openapi.ContentVersionOut>,
            {
              path: { item_id: itemId, project_id: projectId, version_number: versionNumber },
            },
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
          getSeoProfile: ({ projectId, itemId, versionNumber }) =>
            invoke<openapi.ContentSeoProfileOut>(
              openapi.domainProjectsGetProjectContentSeoProfile as OpenApiOperation<openapi.ContentSeoProfileOut>,
              {
                path: { item_id: itemId, project_id: projectId, version_number: versionNumber },
              },
            ),
          listComponentBindings: ({ projectId, itemId, versionNumber }) =>
            invoke<openapi.ContentComponentBindingListOut>(
              openapi.domainProjectsListProjectContentBindings as OpenApiOperation<openapi.ContentComponentBindingListOut>,
              {
                path: { item_id: itemId, project_id: projectId, version_number: versionNumber },
              },
            ),
          listPresentations: ({ projectId, itemId, versionNumber }) =>
            invoke<openapi.ContentPresentationListOut>(
              openapi.domainProjectsListProjectContentPresentations as OpenApiOperation<openapi.ContentPresentationListOut>,
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
          publish: ({ projectId, itemId, versionNumber }) =>
            invoke<openapi.ContentVersionOut>(
              openapi.domainProjectsPublishProjectContentItemVersion as OpenApiOperation<openapi.ContentVersionOut>,
              {
                path: { item_id: itemId, project_id: projectId, version_number: versionNumber },
              },
            ),
        },
      },
      models: {
        list: ({ projectId, page, size, query, category, modelKind, systemManaged }) =>
          invokePage<openapi.ContentModelOut, PagePayload<openapi.ContentModelOut>>(
            openapi.domainProjectsListProjectContentModels as OpenApiOperation<
              PagePayload<openapi.ContentModelOut>
            >,
            {
              path: { project_id: projectId },
              query: {
                category,
                model_kind: modelKind,
                page,
                q: query,
                size,
                system_managed: systemManaged,
              },
            },
          ),
        create: ({ projectId, body }) =>
          invoke<openapi.ContentModelMutationOut>(
            openapi.domainProjectsCreateProjectContentModel as OpenApiOperation<openapi.ContentModelMutationOut>,
            { body, path: { project_id: projectId } },
          ),
        getJsonPreview: ({ projectId, modelId }) =>
          invoke<openapi.ContentModelSchemaSnapshotOut>(
            openapi.domainProjectsGetProjectContentModelJsonPreview as OpenApiOperation<openapi.ContentModelSchemaSnapshotOut>,
            { path: { model_id: modelId, project_id: projectId } },
          ),
        listFieldTypes: ({ projectId }) =>
          invoke<openapi.ContentModelFieldTypeRegistryOut>(
            openapi.domainProjectsListProjectContentModelFieldTypes as OpenApiOperation<openapi.ContentModelFieldTypeRegistryOut>,
            { path: { project_id: projectId } },
          ),
        fields: {
          create: ({ projectId, modelId, body }) =>
            invoke<openapi.ContentModelOut>(
              openapi.domainProjectsCreateProjectContentModelField as OpenApiOperation<openapi.ContentModelOut>,
              { body, path: { model_id: modelId, project_id: projectId } },
            ),
          delete: ({ projectId, modelId, fieldKey }) =>
            invoke<openapi.ContentModelOut>(
              openapi.domainProjectsDeleteProjectContentModelField as OpenApiOperation<openapi.ContentModelOut>,
              { path: { field_key: fieldKey, model_id: modelId, project_id: projectId } },
            ),
          reorder: ({ projectId, modelId, body }) =>
            invoke<openapi.ContentModelOut>(
              openapi.domainProjectsReorderProjectContentModelFields as OpenApiOperation<openapi.ContentModelOut>,
              { body, path: { model_id: modelId, project_id: projectId } },
            ),
          update: ({ projectId, modelId, fieldKey, body }) =>
            invoke<openapi.ContentModelOut>(
              openapi.domainProjectsUpdateProjectContentModelField as OpenApiOperation<openapi.ContentModelOut>,
              { body, path: { field_key: fieldKey, model_id: modelId, project_id: projectId } },
            ),
        },
        update: ({ projectId, modelId, body }) =>
          invoke<openapi.ContentModelMutationOut>(
            openapi.domainProjectsUpdateProjectContentModel as OpenApiOperation<openapi.ContentModelMutationOut>,
            { body, path: { model_id: modelId, project_id: projectId } },
          ),
        updateWithAi: (input) => updateContentModelWithAi({ input, sdk }),
        previewUpdate: ({ projectId, modelId, body }) =>
          invoke<openapi.ContentModelImpactPreviewOut>(
            openapi.domainProjectsPreviewProjectContentModelUpdate as OpenApiOperation<openapi.ContentModelImpactPreviewOut>,
            { body, path: { model_id: modelId, project_id: projectId } },
          ),
        delete: ({ projectId, modelId }) =>
          invokeNone(openapi.domainProjectsDeleteProjectContentModel as OpenApiOperation<null>, {
            path: { model_id: modelId, project_id: projectId },
          }),
      },
      routing: {
        listBindings: ({ projectId }) =>
          invoke<openapi.RouteBindingOut[]>(
            openapi.domainProjectsListProjectContentRouteBindings as OpenApiOperation<
              openapi.RouteBindingOut[]
            >,
            { path: { project_id: projectId } },
          ),
        listHierarchyNodes: ({ projectId }) =>
          invoke<openapi.HierarchyNodeOut[]>(
            openapi.domainProjectsListProjectContentHierarchyNodes as OpenApiOperation<
              openapi.HierarchyNodeOut[]
            >,
            { path: { project_id: projectId } },
          ),
        upsertBinding: ({ projectId, itemId, body }) =>
          invoke<openapi.RouteBindingOut>(
            openapi.domainProjectsUpsertProjectContentRouteBinding as OpenApiOperation<openapi.RouteBindingOut>,
            { body, path: { item_id: itemId, project_id: projectId } },
          ),
        upsertHierarchyNode: ({ projectId, itemId, body }) =>
          invoke<openapi.HierarchyNodeOut>(
            openapi.domainProjectsUpsertProjectContentHierarchyNode as OpenApiOperation<openapi.HierarchyNodeOut>,
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
      publish: ({ body, projectId }) =>
        invoke<openapi.ReleasePublishOut>(
          openapi.domainProjectsPublishProjectRelease as OpenApiOperation<openapi.ReleasePublishOut>,
          { body, path: { project_id: projectId } },
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
    domains: {
      list: ({ projectId, page, size }) =>
        invokePage<openapi.DomainBindingOut, PagePayload<openapi.DomainBindingOut>>(
          openapi.domainProjectsListProjectDomains as OpenApiOperation<
            PagePayload<openapi.DomainBindingOut>
          >,
          { path: { project_id: projectId }, query: { page, size } },
        ),
      create: ({ projectId, body }) =>
        invoke<openapi.DomainBindingCreateOut>(
          openapi.domainProjectsCreateProjectDomain as OpenApiOperation<openapi.DomainBindingCreateOut>,
          { body, path: { project_id: projectId } },
        ),
      verify: ({ projectId, bindingId }) =>
        invoke<openapi.DomainBindingVerifyOut>(
          openapi.domainProjectsVerifyProjectDomain as OpenApiOperation<openapi.DomainBindingVerifyOut>,
          { path: { binding_id: bindingId, project_id: projectId } },
        ),
      update: ({ projectId, bindingId, body }) =>
        invoke<openapi.DomainBindingOut>(
          openapi.domainProjectsUpdateProjectDomain as OpenApiOperation<openapi.DomainBindingOut>,
          { body, path: { binding_id: bindingId, project_id: projectId } },
        ),
      delete: ({ projectId, bindingId }) =>
        invoke<openapi.DomainBindingDeleteOut>(
          openapi.domainProjectsDeleteProjectDomain as OpenApiOperation<openapi.DomainBindingDeleteOut>,
          { path: { binding_id: bindingId, project_id: projectId } },
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
    source: {
      applyPatch: async ({ projectId, operations }) => {
        await operations.reduce(
          (previous, operation) =>
            previous.then(() => {
              if (operation.kind === "upsert") {
                return sdk.source.upsertFile({
                  body: operation.body,
                  filePath: operation.filePath,
                  projectId,
                });
              }
              return sdk.source.deleteFile({
                filePath: operation.filePath,
                projectId,
              });
            }),
          Promise.resolve<unknown>(undefined),
        );
        return sdk.source.getManifest({ projectId });
      },
      deleteFile: ({ projectId, filePath }) =>
        invoke<openapi.ProjectSourceFileDeleteOut>(
          openapi.domainProjectsDeleteProjectSourceFile as OpenApiOperation<openapi.ProjectSourceFileDeleteOut>,
          { path: { file_path: filePath, project_id: projectId } },
        ),
      getManifest: ({ projectId }) =>
        invoke<openapi.ProjectSourceManifestOut>(
          openapi.domainProjectsGetProjectSourceManifest as OpenApiOperation<openapi.ProjectSourceManifestOut>,
          { path: { project_id: projectId } },
        ),
      getStructure: async ({ projectId }) =>
        buildManagementProjectSourceStructureResult(await sdk.source.getManifest({ projectId })),
      readFile: ({ projectId, filePath }) =>
        invoke<openapi.ProjectSourceFileOut>(
          openapi.domainProjectsGetProjectSourceFile as OpenApiOperation<openapi.ProjectSourceFileOut>,
          { path: { file_path: filePath, project_id: projectId } },
        ),
      updateSettings: ({ projectId, ...input }) =>
        sdk.site.patchCoreSettings({
          body: buildManagementProjectSourceSettingsPatch(input),
          projectId,
        }),
      upsertFile: ({ projectId, filePath, body }) =>
        invoke<openapi.ProjectSourceFileOut>(
          openapi.domainProjectsUpsertProjectSourceFile as OpenApiOperation<openapi.ProjectSourceFileOut>,
          { body, path: { file_path: filePath, project_id: projectId } },
        ),
    },
    forProject: (projectId) => createProjectSdk(sdk, projectId),
  };

  return sdk;
};
