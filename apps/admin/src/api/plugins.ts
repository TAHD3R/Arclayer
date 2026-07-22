import { api } from "@/lib/http";

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

export const SYSTEM_PLUGINS_QUERY_KEY = ["system", "plugins"] as const;

export async function listSystemPlugins(signal?: AbortSignal): Promise<SystemPlugin[]> {
  const data = await api.get<SystemPluginList>("/system/plugins", { signal });
  return data.plugins;
}
