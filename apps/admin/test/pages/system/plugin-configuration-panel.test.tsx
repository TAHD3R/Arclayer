import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getSystemPluginConfiguration,
  updateSystemPluginConfiguration,
  type SystemPluginCatalogItem,
} from "@/api/plugins";
import { PluginConfigurationPanel } from "@/pages/system/plugins/plugin-configuration-panel";

vi.mock("@/api/plugins", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/plugins")>()),
  getSystemPluginConfiguration: vi.fn(),
  updateSystemPluginConfiguration: vi.fn(),
}));
vi.mock("@/lib/notifications", () => ({
  notifyError: vi.fn(),
  notifySuccessText: vi.fn(),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const PLUGIN: SystemPluginCatalogItem = {
  name: "arclayer-posthog",
  artifactId: null,
  installationId: "installation-posthog",
  availableVersion: "1.0.0",
  installedVersion: "1.0.0",
  hasUpdate: false,
  lifecycleState: "installed",
  desiredEnabled: true,
  runtimeActivationState: "verified",
  currentOperationId: null,
  currentJobId: null,
  sourceType: "bundled",
  sourceLocator: "plugins/arclayer-posthog",
  artifactChecksum: "sha256:artifact",
  packageChecksum: "sha256:package",
  manifestDigest: "sha256:manifest",
  signerFingerprint: null,
  provenanceStatus: "verified",
  compatibility: {
    compatible: true,
    platformRequirement: ">=1.0.0",
    pythonRequirement: ">=3.12",
    issues: [],
  },
  packageState: "installed",
  processState: "ready",
  provides: {
    services: [],
    middlewares: [],
    providers: [],
    connectors: ["analytics.posthog"],
    contentTypes: [],
  },
  permissions: ["analytics:write"],
  approvedPermissions: ["analytics:write"],
  configSchema: {
    type: "object",
    properties: {
      enabled: { type: "boolean", default: false },
      host: { type: "string", format: "uri" },
      timeoutSeconds: { type: "number", minimum: 1, maximum: 30 },
    },
    additionalProperties: false,
  },
  admin: {
    labelKey: "settings:SETTINGS_SYSTEM_PLUGIN_POSTHOG_NAME",
    descriptionKey: "settings:SETTINGS_SYSTEM_PLUGIN_POSTHOG_DESC",
    settingsPath: null,
  },
  connectorDefinitions: [
    {
      key: "analytics.posthog",
      kind: "analytics",
      version: "1.0.0",
      trustLevel: "official",
      capabilities: ["capture"],
      configSchema: {},
      secretSchema: {
        projectApiKey: { type: "string", writeOnly: true },
      },
      scopes: [],
      webhookEvents: [],
      healthContract: [],
      admin: null,
    },
  ],
};

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PluginConfigurationPanel plugin={PLUGIN} />
    </QueryClientProvider>,
  );
}

describe("PluginConfigurationPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSystemPluginConfiguration).mockResolvedValue({
      pluginName: PLUGIN.name,
      revision: 1,
      values: {
        enabled: false,
        host: "https://us.i.posthog.com",
        timeoutSeconds: 10,
      },
      secretReferences: {},
      restartRequired: false,
      updatedAt: "2026-07-23T10:00:00Z",
    });
    vi.mocked(updateSystemPluginConfiguration).mockResolvedValue({
      pluginName: PLUGIN.name,
      revision: 2,
      values: {
        enabled: true,
        host: "https://eu.i.posthog.com",
        timeoutSeconds: 7,
      },
      secretReferences: { projectApiKey: "env:POSTHOG__PROJECT_API_KEY" },
      restartRequired: true,
      updatedAt: "2026-07-23T10:05:00Z",
    });
  });

  it("renders a schema-driven ledger and revision-saves values plus secret references", async () => {
    const user = userEvent.setup();
    renderPanel();

    expect(await screen.findByText("#1")).toBeVisible();
    await user.click(
      screen.getByRole("switch", {
        name: "SETTINGS_SYSTEM_PLUGIN_CONFIG_FIELD_ARCLAYER_POSTHOG_ENABLED",
      }),
    );
    const host = screen.getByLabelText("SETTINGS_SYSTEM_PLUGIN_CONFIG_FIELD_ARCLAYER_POSTHOG_HOST");
    await user.clear(host);
    await user.type(host, "https://eu.i.posthog.com");
    const timeout = screen.getByLabelText(
      "SETTINGS_SYSTEM_PLUGIN_CONFIG_FIELD_ARCLAYER_POSTHOG_TIMEOUTSECONDS",
    );
    await user.clear(timeout);
    await user.type(timeout, "7");
    await user.type(
      screen.getByLabelText("SETTINGS_SYSTEM_PLUGIN_CONFIG_FIELD_ARCLAYER_POSTHOG_PROJECTAPIKEY"),
      "env:POSTHOG__PROJECT_API_KEY",
    );
    await user.click(screen.getByRole("button", { name: "SETTINGS_SYSTEM_PLUGIN_CONFIG_SAVE" }));

    await waitFor(() => {
      expect(updateSystemPluginConfiguration).toHaveBeenCalledWith(PLUGIN.name, {
        expectedRevision: 1,
        values: {
          enabled: true,
          host: "https://eu.i.posthog.com",
          timeoutSeconds: 7,
        },
        secretReferences: { projectApiKey: "env:POSTHOG__PROJECT_API_KEY" },
      });
    });
    expect(await screen.findByText("#2")).toBeVisible();
    expect(screen.getByText("SETTINGS_SYSTEM_PLUGIN_CONFIG_RESTART_NOTICE")).toBeVisible();
  });
});
