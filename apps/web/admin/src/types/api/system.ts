export type SetupAccessMode = "local_only" | "token";

export type SystemSetupStatus = {
  initialized: boolean;
  masterKeyReady: boolean;
  repairRequired: boolean;
  repairHint?: string | null;
  setupEnabled: boolean;
  access: SetupAccessMode;
};

export type SystemSetupRequest = {
  admin: {
    username: string;
    password: string;
    email: string;
    display_name: string;
  };
  organization?: {
    name: string;
    slug?: string | null;
    logo_url?: string | null;
  } | null;
  master_key?: string;
  core_patch: Record<string, unknown>;
};

export type SystemSetupResult = {
  initialized_at: string;
  master_key_fingerprint: string;
  admin_user_id: string;
  admin_username: string;
  rbac_bootstrapped: boolean;
  organization_id?: string | null;
  organization_slug?: string | null;
  organization_name?: string | null;
};

export type SystemSetupJobStatus = "pending" | "running" | "succeeded" | "failed";
export type SystemSetupJobStage = "precheck" | "admin" | "provision" | "workspace" | "finalize";

export type SystemSetupJob = {
  jobId: string;
  status: SystemSetupJobStatus;
  stage: SystemSetupJobStage;
  percent: number;
  createdAt: string;
};

export type SystemSetupJobStatusPayload = SystemSetupJob & {
  startedAt?: string | null;
  finishedAt?: string | null;
  warnings: string[];
  errorCode?: string | null;
  errorMessage?: string | null;
  result?: SystemSetupResult | null;
};

export type DeploymentMode = "saas" | "self_host";

export type SystemRuntime = {
  deploymentMode: DeploymentMode;
  capabilities: {
    deploymentSettingsEnabled: boolean;
    publicRegisterEnabled: boolean;
  };
};
