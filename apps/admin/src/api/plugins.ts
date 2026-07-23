import { toQueryString } from "@/lib/api";
import { api, apiRequest } from "@/lib/http";

export type SystemConnectorDefinition = {
  key: string;
  kind: "billing" | "oauth" | "analytics" | "email";
  version: string;
  trustLevel: "official" | "third_party";
  capabilities: string[];
  configSchema: Record<string, unknown>;
  secretSchema: Record<string, unknown>;
  scopes: string[];
  webhookEvents: string[];
  healthContract: string[];
  admin: {
    labelKey: string;
    descriptionKey: string;
    settingsSection: string | null;
    iconKey: string | null;
  } | null;
};

export type SystemPlugin = {
  name: string;
  version: string;
  packageState: "absent" | "installed" | "uninstalled";
  processState: "unloaded" | "loaded" | "registered" | "ready" | "destroyed";
  provides: {
    services: string[];
    middlewares: string[];
    providers: string[];
    connectors: string[];
    contentTypes: string[];
  };
  permissions: string[];
  configSchema: Record<string, unknown>;
  admin: {
    labelKey: string;
    descriptionKey: string;
    settingsPath: string | null;
  } | null;
  connectorDefinitions: SystemConnectorDefinition[];
};

type SystemPluginList = { plugins: SystemPlugin[] };

export type SystemPluginCatalogItem = {
  name: string;
  artifactId: string | null;
  installationId: string | null;
  availableVersion: string;
  installedVersion: string | null;
  hasUpdate: boolean;
  lifecycleState:
    | "installing"
    | "installed"
    | "update_available"
    | "upgrading"
    | "disabling"
    | "disabled"
    | "uninstalling"
    | "failed"
    | "rollback_required"
    | null;
  desiredEnabled: boolean | null;
  runtimeActivationState: "not_required" | "pending_restart" | "verified" | "failed" | null;
  currentOperationId: string | null;
  currentJobId: string | null;
  sourceType: SystemPluginSourceType;
  sourceLocator: string;
  artifactChecksum: string;
  packageChecksum: string;
  manifestDigest: string;
  signerFingerprint: string | null;
  provenanceStatus: "verified";
  compatibility: {
    compatible: boolean;
    platformRequirement: string | null;
    pythonRequirement: string | null;
    issues: string[];
  };
  packageState: SystemPlugin["packageState"] | null;
  processState: SystemPlugin["processState"] | null;
  provides: SystemPlugin["provides"];
  permissions: string[];
  approvedPermissions: string[];
  configSchema: Record<string, unknown>;
  admin: SystemPlugin["admin"];
  connectorDefinitions: SystemConnectorDefinition[];
};

export type SystemPluginCatalogQuery = {
  search?: string;
  installedOnly?: boolean;
  updatesOnly?: boolean;
  includeOnline?: boolean;
  ordering?: "name" | "-name" | "version" | "-version";
};

type SystemPluginCatalogList = { items: SystemPluginCatalogItem[] };

export type SystemPluginSourceType = "bundled" | "catalog" | "manual_upload";

export type SystemPluginArtifactReview = {
  id: string;
  createdAt: string;
  updatedAt: string;
  pluginName: string;
  version: string;
  sourceType: SystemPluginSourceType;
  sourceLocator: string;
  artifactChecksum: string;
  packageChecksum: string;
  manifestDigest: string;
  signerFingerprint: string;
  provenanceStatus: string;
  sizeBytes: number;
  compatibility: SystemPluginCatalogItem["compatibility"];
  provides: SystemPlugin["provides"];
  permissions: string[];
  configSchema: Record<string, unknown>;
  admin: SystemPlugin["admin"];
};

export type SystemPluginInstallationRequest =
  | {
      sourceType: "bundled" | "catalog";
      pluginName: string;
      targetVersion?: string;
      approvedPermissions: string[];
    }
  | {
      sourceType: "manual_upload";
      artifactId: string;
      approvedPermissions: string[];
    };

export type SystemPluginOperationKind =
  | "install"
  | "upgrade"
  | "rollback"
  | "enable"
  | "disable"
  | "uninstall";

export type SystemPluginOperation = {
  id: string;
  pluginName: string;
  kind: SystemPluginOperationKind;
  state: "queued" | "running" | "waiting_for_restart" | "succeeded" | "failed" | "cancelled";
  phase: string;
  progressCompleted: number;
  progressTotal: number | null;
  jobId: string | null;
  requestedVersion: string | null;
  permissionDiff: {
    added?: string[];
    removed?: string[];
    approved?: string[];
  };
  migrationWarnings: string[];
  restartRequired: boolean;
  activationVerified: boolean;
  retryable: boolean;
  failureCode: string | null;
  failureSummary: string | null;
  requestedByUserId: string;
  startedAt: string | null;
  completedAt: string | null;
};

export type SystemPluginDetail = SystemPluginCatalogItem & {
  recentOperations: SystemPluginOperation[];
};

export type SystemPluginConfiguration = {
  pluginName: string;
  revision: number;
  values: Record<string, unknown>;
  secretReferences: Record<string, string>;
  restartRequired: boolean;
  updatedAt: string;
};

export type SystemPluginConfigurationPatch = {
  expectedRevision: number;
  values: Record<string, unknown>;
  secretReferences: Record<string, string>;
};

export const SYSTEM_PLUGINS_QUERY_KEY = ["system", "plugins"] as const;

export async function listSystemPlugins(signal?: AbortSignal): Promise<SystemPlugin[]> {
  const data = await api.get<SystemPluginList>("/system/plugins", { signal });
  return data.plugins;
}

export async function listSystemPluginCatalog(
  query: SystemPluginCatalogQuery,
  signal?: AbortSignal,
): Promise<SystemPluginCatalogItem[]> {
  const qs = toQueryString({
    search: query.search,
    installedOnly: query.installedOnly,
    updatesOnly: query.updatesOnly,
    includeOnline: query.includeOnline,
    ordering: query.ordering ?? "name",
  });
  const data = await api.get<SystemPluginCatalogList>(`/system/plugins/catalog${qs}`, { signal });
  return data.items;
}

export async function getSystemPluginDetail(
  pluginId: string,
  signal?: AbortSignal,
): Promise<SystemPluginDetail> {
  return api.get<SystemPluginDetail>(`/system/plugins/${encodeURIComponent(pluginId)}`, {
    signal,
  });
}

export async function getSystemPluginConfiguration(
  pluginId: string,
  signal?: AbortSignal,
): Promise<SystemPluginConfiguration> {
  return api.get<SystemPluginConfiguration>(
    `/system/plugins/${encodeURIComponent(pluginId)}/configuration`,
    { signal },
  );
}

export async function updateSystemPluginConfiguration(
  pluginId: string,
  payload: SystemPluginConfigurationPatch,
): Promise<SystemPluginConfiguration> {
  return api.patch<SystemPluginConfiguration>(
    `/system/plugins/${encodeURIComponent(pluginId)}/configuration`,
    payload,
  );
}

export async function installSystemPlugin(
  payload: SystemPluginInstallationRequest,
  idempotencyKey: string,
): Promise<SystemPluginOperation> {
  return api.post<SystemPluginOperation>("/system/plugins/installations", payload, {
    headers: { "Idempotency-Key": idempotencyKey },
  });
}

export async function reviewManualSystemPluginArtifact(
  packageFile: File,
  detachedSignature: string,
): Promise<SystemPluginArtifactReview> {
  const formData = new FormData();
  formData.set("package", packageFile);
  formData.set("detached_signature", detachedSignature);
  return api.post<SystemPluginArtifactReview>("/system/plugins/artifacts/manual", formData);
}

export async function startSystemPluginOperation(
  pluginId: string,
  kind: Exclude<SystemPluginOperationKind, "install">,
  approvedPermissions: string[],
  idempotencyKey: string,
): Promise<SystemPluginOperation> {
  const path = `/system/plugins/${encodeURIComponent(pluginId)}`;
  const body = { approvedPermissions };
  const headers = { "Idempotency-Key": idempotencyKey };
  if (kind === "uninstall") {
    return apiRequest<SystemPluginOperation>(path, { method: "DELETE", body, headers });
  }
  return api.post<SystemPluginOperation>(`${path}/${kind}`, body, { headers });
}

export async function getSystemPluginOperation(
  operationId: string,
  signal?: AbortSignal,
): Promise<SystemPluginOperation> {
  return api.get<SystemPluginOperation>(
    `/system/plugin-operations/${encodeURIComponent(operationId)}`,
    { signal },
  );
}
