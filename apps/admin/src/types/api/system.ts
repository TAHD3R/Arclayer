export type SystemInstanceSetupStatus = "uninitialized" | "ready" | "repair_required";

export type SystemRuntime = {
  capabilities: {
    deploymentSettingsEnabled: boolean;
    publicRegisterEnabled: boolean;
  };
  instanceSetup: {
    status: SystemInstanceSetupStatus;
    repairReason: string | null;
  };
};

export type SystemBootstrapPayload = {
  username: string;
  email: string;
  password: string;
  display_name: string;
};
