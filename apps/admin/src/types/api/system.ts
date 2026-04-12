export type DeploymentMode = "saas" | "self_host";

export type DeploymentScope = DeploymentMode | "both";

export type SystemFlags = {
  deploymentMode: DeploymentMode;
  multiTenant: boolean;
  customDomain: boolean;
  visualEditor: boolean;
  deploymentSettings: boolean;
  publicRegister: boolean;
};

export type SystemRuntime = {
  deploymentMode: DeploymentMode;
  capabilities: {
    deploymentSettingsEnabled: boolean;
    publicRegisterEnabled: boolean;
  };
  systemFlags: SystemFlags;
};
