import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listSystemPlugins, type SystemPlugin } from "@/api/plugins";
import { getSystemCoreSettings, patchSystemCoreSettings } from "@/api/settings";
import { SystemSettingsOAuthPage } from "@/pages/system/oauth/page";

vi.mock("@/api/plugins", () => ({
  SYSTEM_PLUGINS_QUERY_KEY: ["system", "plugins"],
  listSystemPlugins: vi.fn(),
}));

vi.mock("@/api/settings", () => ({
  getSystemCoreSettings: vi.fn(),
  patchSystemCoreSettings: vi.fn(),
}));

vi.mock("@/lib/notifications", () => ({
  notifySuccessText: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/layouts/page-shell/content-guard", () => ({
  ContentGuard: ({
    loading,
    error,
    empty,
    emptyTitle,
    emptyDescription,
    onRetry,
    children,
  }: {
    loading?: boolean;
    error?: unknown;
    empty?: boolean;
    emptyTitle?: React.ReactNode;
    emptyDescription?: React.ReactNode;
    onRetry?: () => void;
    children?: React.ReactNode;
  }) => {
    if (loading) return <div role="status">loading</div>;
    if (error) {
      return (
        <div role="alert">
          request error
          <button type="button" onClick={onRetry}>
            retry
          </button>
        </div>
      );
    }
    if (empty) {
      return (
        <div>
          <div>{emptyTitle}</div>
          <div>{emptyDescription}</div>
        </div>
      );
    }
    return <>{children}</>;
  },
}));

const CORE_SETTINGS = {
  namespace: "core",
  settingSchema: { sections: [] },
  value: {
    oauth_google: { enabled: true, client_id: "google-client" },
    oauth_github: { enabled: false, client_id: null },
    oauth_microsoft: { enabled: false, client_id: null },
    oauth_discord: { enabled: false, client_id: null },
  },
  secrets: {
    "oauth_google.client_secret": true,
  },
} satisfies Awaited<ReturnType<typeof getSystemCoreSettings>>;

const OAUTH_PLUGIN: SystemPlugin = {
  name: "arclayer-oauth",
  version: "1.0.0",
  packageState: "installed",
  processState: "ready",
  provides: {
    services: [],
    middlewares: [],
    providers: [],
    connectors: ["oauth.google", "oauth.github", "oauth.microsoft", "oauth.discord"],
    contentTypes: [],
  },
  permissions: [],
  configSchema: {},
  admin: {
    labelKey: "settings:SETTINGS_SYSTEM_PLUGIN_OAUTH_NAME",
    descriptionKey: "settings:SETTINGS_SYSTEM_PLUGIN_OAUTH_DESC",
    settingsPath: "/system/settings/oauth",
  },
  connectorDefinitions: ["google", "github", "microsoft", "discord"].map((provider) => ({
    key: `oauth.${provider}`,
    kind: "oauth" as const,
    version: "1.0.0",
    trustLevel: "official" as const,
    capabilities: ["authorize", "token_exchange", "profile"],
    configSchema: {},
    secretSchema: {},
    scopes: [],
    webhookEvents: [],
    healthContract: [],
    admin: {
      labelKey: `settings:SETTINGS_SYSTEM_OAUTH_${provider.toUpperCase()}_TITLE`,
      descriptionKey: `settings:SETTINGS_SYSTEM_OAUTH_${provider.toUpperCase()}_DESC`,
      settingsSection: `oauth_${provider}`,
      iconKey: provider,
    },
  })),
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SystemSettingsOAuthPage />
    </QueryClientProvider>,
  );
}

describe("SystemSettingsOAuthPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSystemCoreSettings).mockResolvedValue(CORE_SETTINGS);
    vi.mocked(patchSystemCoreSettings).mockResolvedValue(CORE_SETTINGS);
  });

  it("exposes plugin loading, error retry, and empty states", async () => {
    let rejectRequest: ((reason: Error) => void) | undefined;
    vi.mocked(listSystemPlugins).mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectRequest = reject;
        }),
    );
    renderPage();

    expect(screen.getByRole("status")).toHaveTextContent("loading");
    rejectRequest?.(new Error("network"));
    expect(await screen.findByRole("alert")).toHaveTextContent("request error");

    vi.mocked(listSystemPlugins).mockResolvedValueOnce([]);
    await userEvent.setup().click(screen.getByRole("button", { name: "retry" }));
    expect(await screen.findByText("settings:SETTINGS_SYSTEM_OAUTH_EMPTY_TITLE")).toBeVisible();
    expect(screen.getByText("settings:SETTINGS_SYSTEM_OAUTH_EMPTY_DESC")).toBeVisible();
  });

  it("renders providers from OAuth connector definitions", async () => {
    vi.mocked(listSystemPlugins).mockResolvedValue([OAUTH_PLUGIN]);
    renderPage();

    expect(await screen.findByText("settings:SETTINGS_SYSTEM_OAUTH_GOOGLE_TITLE")).toBeVisible();
    expect(screen.getByText("settings:SETTINGS_SYSTEM_OAUTH_GITHUB_TITLE")).toBeVisible();
    expect(screen.getByText("settings:SETTINGS_SYSTEM_OAUTH_MICROSOFT_TITLE")).toBeVisible();
    expect(screen.getByText("settings:SETTINGS_SYSTEM_OAUTH_DISCORD_TITLE")).toBeVisible();
  });

  it("saves a provider to the settings section declared by its connector", async () => {
    const user = userEvent.setup();
    vi.mocked(listSystemPlugins).mockResolvedValue([OAUTH_PLUGIN]);
    renderPage();

    const githubSection = await waitFor(() => {
      const node = document.getElementById("github");
      expect(node).not.toBeNull();
      return node as HTMLElement;
    });
    const scope = within(githubSection);
    await user.type(
      scope.getByLabelText("settings:SETTINGS_SYSTEM_OAUTH_CLIENT_ID_LABEL"),
      "github-client",
    );
    await user.click(scope.getByRole("button", { name: "settings:SETTINGS_SAVE" }));

    await waitFor(() => {
      expect(patchSystemCoreSettings).toHaveBeenCalledWith({
        oauth_github: {
          enabled: false,
          client_id: "github-client",
        },
      });
    });
  });
});
