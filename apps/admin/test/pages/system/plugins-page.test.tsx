import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listSystemPlugins, type SystemPlugin } from "@/api/plugins";
import { SystemPluginsPage } from "@/pages/system/plugins/page";

vi.mock("@/api/plugins", () => ({
  SYSTEM_PLUGINS_QUERY_KEY: ["system", "plugins"],
  listSystemPlugins: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children?: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/layouts/page-shell/default-page", () => ({
  DefaultPage: ({
    title,
    description,
    children,
  }: {
    title?: React.ReactNode;
    description?: React.ReactNode;
    children?: React.ReactNode;
  }) => (
    <main>
      <h1>{title}</h1>
      <p>{description}</p>
      {children}
    </main>
  ),
}));
vi.mock("@/layouts/page-shell/content-guard", () => ({
  ContentGuard: ({
    loading,
    error,
    empty,
    emptyTitle,
    onRetry,
    children,
  }: {
    loading: boolean;
    error?: unknown;
    empty?: boolean;
    emptyTitle?: React.ReactNode;
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
    if (empty) return <div>{emptyTitle}</div>;
    return <>{children}</>;
  },
}));

const CORE_PLUGIN: SystemPlugin = {
  name: "arclayer-core",
  version: "1.0.0",
  packageState: "installed",
  processState: "ready",
  provides: {
    services: ["core-service"],
    middlewares: [],
    providers: [],
    connectors: [],
    contentTypes: ["user-profile"],
  },
  permissions: [],
  configSchema: {},
  admin: {
    labelKey: "settings:SETTINGS_SYSTEM_PLUGIN_CORE_NAME",
    descriptionKey: "settings:SETTINGS_SYSTEM_PLUGIN_CORE_DESC",
    settingsPath: null,
  },
  connectorDefinitions: [],
};

const CONFIGURABLE_PLUGIN: SystemPlugin = {
  ...CORE_PLUGIN,
  name: "configurable-plugin",
  processState: "loaded",
  permissions: ["plugin:manage"],
  admin: {
    labelKey: "settings:CONFIGURABLE_PLUGIN_NAME",
    descriptionKey: "settings:CONFIGURABLE_PLUGIN_DESC",
    settingsPath: "/system/settings/configurable-plugin",
  },
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SystemPluginsPage />
    </QueryClientProvider>,
  );
}

describe("SystemPluginsPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("exposes loading, error retry, and empty states", async () => {
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
    expect(await screen.findByText("settings:SETTINGS_SYSTEM_PLUGINS_EMPTY_TITLE")).toBeVisible();
  });

  it("renders runtime state and only links configurable plugins", async () => {
    vi.mocked(listSystemPlugins).mockResolvedValue([CORE_PLUGIN, CONFIGURABLE_PLUGIN]);
    renderPage();

    expect(await screen.findByText("settings:SETTINGS_SYSTEM_PLUGIN_CORE_NAME")).toBeVisible();
    expect(screen.getByText("settings:SETTINGS_SYSTEM_PLUGIN_STATE_READY")).toBeVisible();
    expect(screen.getByText("settings:SETTINGS_SYSTEM_PLUGIN_STATE_LOADED")).toBeVisible();
    expect(screen.getAllByText("settings:SETTINGS_SYSTEM_PLUGIN_CAPABILITIES")).toHaveLength(2);
    expect(screen.getByText("settings:SETTINGS_SYSTEM_PLUGIN_PERMISSIONS")).toBeVisible();

    const configureLinks = screen.getAllByRole("link", {
      name: "settings:SETTINGS_SYSTEM_PLUGIN_CONFIGURE",
    });
    expect(configureLinks).toHaveLength(1);
    expect(configureLinks[0]).toHaveAttribute("href", "/system/settings/configurable-plugin");
  });
});
