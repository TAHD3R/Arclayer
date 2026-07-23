import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChromeTabsProvider } from "@arclayer/ui/chrome-tabs";

import {
  getSystemPluginDetail,
  getSystemPluginOperation,
  installSystemPlugin,
  listSystemPluginCatalog,
  reviewManualSystemPluginArtifact,
  startSystemPluginOperation,
  type SystemPluginArtifactReview,
  type SystemPluginCatalogItem,
  type SystemPluginOperation,
} from "@/api/plugins";
import { SystemPluginsPage } from "@/pages/system/plugins/page";
import { ApiError } from "@/lib/http";

vi.mock("@/api/plugins", () => ({
  getSystemPluginDetail: vi.fn(),
  getSystemPluginOperation: vi.fn(),
  installSystemPlugin: vi.fn(),
  listSystemPluginCatalog: vi.fn(),
  reviewManualSystemPluginArtifact: vi.fn(),
  startSystemPluginOperation: vi.fn(),
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
    action,
    children,
  }: {
    title?: React.ReactNode;
    description?: React.ReactNode;
    action?: React.ReactNode;
    children?: React.ReactNode;
  }) => (
    <main>
      <h1>{title}</h1>
      <p>{description}</p>
      {action}
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
    emptyDescription,
    emptyExtra,
    onRetry,
    children,
  }: {
    loading: boolean;
    error?: unknown;
    empty?: boolean;
    emptyTitle?: React.ReactNode;
    emptyDescription?: React.ReactNode;
    emptyExtra?: React.ReactNode;
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
          <h2>{emptyTitle}</h2>
          <p>{emptyDescription}</p>
          {emptyExtra}
        </div>
      );
    }
    return <>{children}</>;
  },
}));
vi.mock("@arclayer/ui/drawer", () => ({
  Drawer: ({ open, children }: { open: boolean; children?: React.ReactNode }) =>
    open ? <div role="dialog">{children}</div> : null,
  DrawerBody: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DrawerContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DrawerDescription: ({ children }: { children?: React.ReactNode }) => <p>{children}</p>,
  DrawerFooter: ({ children }: { children?: React.ReactNode }) => <footer>{children}</footer>,
  DrawerHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DrawerTitle: ({ children }: { children?: React.ReactNode }) => <h2>{children}</h2>,
}));
vi.mock("@arclayer/ui/alert-dialog", () => ({
  AlertDialog: ({ open, children }: { open: boolean; children?: React.ReactNode }) =>
    open ? <div role="alertdialog">{children}</div> : null,
  AlertDialogContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: { children?: React.ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { children?: React.ReactNode }) => <footer>{children}</footer>,
  AlertDialogHeader: ({ children }: { children?: React.ReactNode }) => <header>{children}</header>,
  AlertDialogTitle: ({ children }: { children?: React.ReactNode }) => <h2>{children}</h2>,
}));
vi.mock("@arclayer/ui/radix-primitives/radix-alert-dialog", () => ({
  AlertDialogAction: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  AlertDialogCancel: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

const CORE_PLUGIN: SystemPluginCatalogItem = {
  name: "arclayer-core",
  artifactId: null,
  installationId: "installation-core",
  availableVersion: "1.0.0",
  installedVersion: "1.0.0",
  hasUpdate: false,
  lifecycleState: "installed",
  desiredEnabled: true,
  runtimeActivationState: "verified",
  currentOperationId: null,
  currentJobId: null,
  sourceType: "bundled",
  sourceLocator: "plugins/arclayer-core",
  artifactChecksum: `sha256:${"c".repeat(64)}`,
  packageChecksum: `sha256:${"a".repeat(64)}`,
  manifestDigest: `sha256:${"b".repeat(64)}`,
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
    services: ["core-service"],
    middlewares: [],
    providers: [],
    connectors: [],
    contentTypes: ["user-profile"],
  },
  permissions: [],
  approvedPermissions: [],
  configSchema: {},
  admin: {
    labelKey: "settings:SETTINGS_SYSTEM_PLUGIN_CORE_NAME",
    descriptionKey: "settings:SETTINGS_SYSTEM_PLUGIN_CORE_DESC",
    settingsPath: null,
  },
  connectorDefinitions: [],
};

const CONFIGURABLE_PLUGIN: SystemPluginCatalogItem = {
  ...CORE_PLUGIN,
  name: "configurable-plugin",
  sourceLocator: "plugins/configurable-plugin",
  processState: "loaded",
  permissions: ["plugin:manage"],
  configSchema: { properties: { enabled: { type: "boolean" } } },
  admin: {
    labelKey: "settings:CONFIGURABLE_PLUGIN_NAME",
    descriptionKey: "settings:CONFIGURABLE_PLUGIN_DESC",
    settingsPath: "/system/settings/configurable-plugin",
  },
};

const AVAILABLE_PLUGIN: SystemPluginCatalogItem = {
  ...CONFIGURABLE_PLUGIN,
  name: "available-plugin",
  installationId: null,
  installedVersion: null,
  lifecycleState: null,
  desiredEnabled: null,
  runtimeActivationState: null,
  packageState: null,
  processState: null,
};

const DISABLE_OPERATION: SystemPluginOperation = {
  id: "operation-disable",
  pluginName: CONFIGURABLE_PLUGIN.name,
  kind: "disable",
  state: "queued",
  phase: "queued",
  progressCompleted: 0,
  progressTotal: 5,
  jobId: "job-disable",
  requestedVersion: CONFIGURABLE_PLUGIN.availableVersion,
  permissionDiff: { added: [], removed: [], approved: [] },
  migrationWarnings: [],
  restartRequired: false,
  activationVerified: false,
  retryable: false,
  failureCode: null,
  failureSummary: null,
  requestedByUserId: "operator",
  startedAt: null,
  completedAt: null,
};

const INSTALL_OPERATION: SystemPluginOperation = {
  ...DISABLE_OPERATION,
  id: "operation-install",
  pluginName: AVAILABLE_PLUGIN.name,
  kind: "install",
  jobId: "job-install",
};

const MANUAL_REVIEW: SystemPluginArtifactReview = {
  id: "artifact-manual",
  createdAt: "2026-07-23T10:00:00Z",
  updatedAt: "2026-07-23T10:00:00Z",
  pluginName: "manual-plugin",
  version: "2.0.0",
  sourceType: "manual_upload",
  sourceLocator: "manual-upload:sha256",
  artifactChecksum: `sha256:${"d".repeat(64)}`,
  packageChecksum: `sha256:${"e".repeat(64)}`,
  manifestDigest: `sha256:${"f".repeat(64)}`,
  signerFingerprint: "1".repeat(64),
  provenanceStatus: "signed_manual",
  sizeBytes: 4_096,
  compatibility: {
    compatible: true,
    platformRequirement: ">=1.0.0",
    pythonRequirement: ">=3.12",
    issues: [],
  },
  provides: {
    services: ["manual-service"],
    middlewares: [],
    providers: [],
    connectors: [],
    contentTypes: [],
  },
  permissions: ["manual:execute"],
  configSchema: {},
  admin: null,
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ChromeTabsProvider
        labels={{ scrollLeftAriaLabel: "scroll left", scrollRightAriaLabel: "scroll right" }}
        userReducedMotion
      >
        <SystemPluginsPage />
      </ChromeTabsProvider>
    </QueryClientProvider>,
  );
}

describe("SystemPluginsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSystemPluginDetail).mockResolvedValue({
      ...CONFIGURABLE_PLUGIN,
      recentOperations: [],
    });
    vi.mocked(getSystemPluginOperation).mockRejectedValue(new Error("unexpected operation poll"));
    vi.mocked(installSystemPlugin).mockRejectedValue(new Error("unexpected install"));
    vi.mocked(reviewManualSystemPluginArtifact).mockRejectedValue(
      new Error("unexpected manual review"),
    );
    vi.mocked(startSystemPluginOperation).mockRejectedValue(new Error("unexpected operation"));
  });

  it("exposes loading, error retry, and tab-specific empty states", async () => {
    let rejectRequest: ((reason: Error) => void) | undefined;
    vi.mocked(listSystemPluginCatalog).mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectRequest = reject;
        }),
    );
    renderPage();
    expect(screen.getByRole("status")).toHaveTextContent("loading");

    rejectRequest?.(new Error("network"));
    expect(await screen.findByRole("alert")).toHaveTextContent("request error");

    vi.mocked(listSystemPluginCatalog).mockResolvedValueOnce([]);
    await userEvent.setup().click(screen.getByRole("button", { name: "retry" }));
    expect(
      await screen.findByRole("heading", {
        name: "settings:SETTINGS_SYSTEM_PLUGINS_INSTALLED_EMPTY_TITLE",
      }),
    ).toBeVisible();
  });

  it("renders ChromeTabs, server-owned catalog controls, and keyboard-reachable cards", async () => {
    const user = userEvent.setup();
    vi.mocked(listSystemPluginCatalog).mockResolvedValue([CORE_PLUGIN, CONFIGURABLE_PLUGIN]);
    renderPage();

    expect(await screen.findByText("settings:SETTINGS_SYSTEM_PLUGIN_CORE_NAME")).toBeVisible();
    expect(
      screen.getByRole("tab", { name: "settings:SETTINGS_SYSTEM_PLUGINS_TAB_INSTALLED" }),
    ).toBeVisible();
    expect(
      screen.getByRole("tab", { name: "settings:SETTINGS_SYSTEM_PLUGINS_TAB_UPDATES" }),
    ).toBeVisible();
    expect(
      screen.getByRole("tab", { name: "settings:SETTINGS_SYSTEM_PLUGINS_TAB_CATALOG" }),
    ).toBeVisible();
    expect(screen.getAllByText("SETTINGS_SYSTEM_PLUGIN_CAPABILITIES")).toHaveLength(2);

    await user.click(
      screen.getByRole("button", { name: "settings:SETTINGS_SYSTEM_PLUGINS_BROWSE_ACTION" }),
    );
    await waitFor(() => {
      expect(listSystemPluginCatalog).toHaveBeenLastCalledWith(
        expect.objectContaining({
          installedOnly: false,
          updatesOnly: false,
          includeOnline: true,
        }),
        expect.any(AbortSignal),
      );
    });

    await user.type(
      screen.getByPlaceholderText("settings:SETTINGS_SYSTEM_PLUGINS_SEARCH_PLACEHOLDER"),
      "connector",
    );
    await waitFor(() => {
      expect(listSystemPluginCatalog).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: "connector" }),
        expect.any(AbortSignal),
      );
    });
  });

  it("renders an explicit deployment state when the online catalog is not configured", async () => {
    const user = userEvent.setup();
    vi.mocked(listSystemPluginCatalog)
      .mockResolvedValueOnce([CORE_PLUGIN])
      .mockRejectedValueOnce(
        new ApiError({
          status: 503,
          error: "PLUGIN_CATALOG_NOT_CONFIGURED",
          message: "No approved online plugin catalog is configured",
        }),
      );
    renderPage();

    await user.click(
      await screen.findByRole("tab", {
        name: "settings:SETTINGS_SYSTEM_PLUGINS_TAB_CATALOG",
      }),
    );

    expect(
      await screen.findByRole("heading", {
        name: "settings:SETTINGS_SYSTEM_PLUGINS_CATALOG_NOT_CONFIGURED_TITLE",
      }),
    ).toBeVisible();
    expect(
      screen.getByText("settings:SETTINGS_SYSTEM_PLUGINS_CATALOG_NOT_CONFIGURED_DESC"),
    ).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("opens verified detail and routes configuration through the canonical settings link", async () => {
    const user = userEvent.setup();
    vi.mocked(listSystemPluginCatalog).mockResolvedValue([CONFIGURABLE_PLUGIN]);
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "SETTINGS_SYSTEM_PLUGIN_OPEN_DETAIL" }),
    );

    expect(await screen.findByRole("dialog")).toBeVisible();
    await waitFor(() => {
      expect(getSystemPluginDetail).toHaveBeenCalledWith(
        CONFIGURABLE_PLUGIN.name,
        expect.any(AbortSignal),
      );
    });
    expect(screen.getByText(CONFIGURABLE_PLUGIN.packageChecksum)).toBeVisible();
    expect(screen.getByRole("link", { name: /SETTINGS_SYSTEM_PLUGIN_CONFIGURE/ })).toHaveAttribute(
      "href",
      "/system/settings/configurable-plugin",
    );
  });

  it("requires confirmation and starts a durable lifecycle operation", async () => {
    const user = userEvent.setup();
    vi.mocked(listSystemPluginCatalog).mockResolvedValue([CONFIGURABLE_PLUGIN]);
    vi.mocked(startSystemPluginOperation).mockResolvedValue(DISABLE_OPERATION);
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "SETTINGS_SYSTEM_PLUGIN_OPEN_DETAIL" }),
    );
    await user.click(
      await screen.findByRole("button", {
        name: "SETTINGS_SYSTEM_PLUGIN_OPERATION_DISABLE_CONFIRM",
      }),
    );

    const dialog = screen.getByRole("alertdialog");
    expect(dialog).not.toHaveTextContent("settings:SETTINGS_SYSTEM_PLUGIN_PERMISSION_REVIEW_TITLE");
    const confirmButtons = screen.getAllByRole("button", {
      name: "settings:SETTINGS_SYSTEM_PLUGIN_OPERATION_DISABLE_CONFIRM",
    });
    await user.click(confirmButtons.at(-1)!);

    await waitFor(() => {
      expect(startSystemPluginOperation).toHaveBeenCalledWith(
        CONFIGURABLE_PLUGIN.name,
        "disable",
        CONFIGURABLE_PLUGIN.permissions,
        expect.any(String),
      );
    });
    expect(await screen.findByText("SETTINGS_SYSTEM_PLUGIN_OPERATION_STATE_QUEUED")).toBeVisible();
  });

  it("requires explicit review before granting install permissions", async () => {
    const user = userEvent.setup();
    vi.mocked(listSystemPluginCatalog).mockResolvedValue([AVAILABLE_PLUGIN]);
    vi.mocked(getSystemPluginDetail).mockResolvedValue({
      ...AVAILABLE_PLUGIN,
      recentOperations: [],
    });
    vi.mocked(installSystemPlugin).mockResolvedValue(INSTALL_OPERATION);
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "SETTINGS_SYSTEM_PLUGIN_OPEN_DETAIL" }),
    );
    await user.click(
      await screen.findByRole("button", {
        name: "SETTINGS_SYSTEM_PLUGIN_OPERATION_INSTALL_CONFIRM",
      }),
    );

    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("settings:SETTINGS_SYSTEM_PLUGIN_PERMISSION_REVIEW_TITLE");
    expect(dialog).toHaveTextContent("plugin:manage");
    await user.click(
      screen.getByRole("button", {
        name: "settings:SETTINGS_SYSTEM_PLUGIN_OPERATION_INSTALL_CONFIRM",
      }),
    );

    await waitFor(() => {
      expect(installSystemPlugin).toHaveBeenCalledWith(
        {
          sourceType: "bundled",
          pluginName: AVAILABLE_PLUGIN.name,
          targetVersion: undefined,
          approvedPermissions: AVAILABLE_PLUGIN.permissions,
        },
        expect.any(String),
      );
    });
  });

  it("reviews a signed manual package before starting installation", async () => {
    const user = userEvent.setup();
    vi.mocked(listSystemPluginCatalog).mockResolvedValue([]);
    vi.mocked(reviewManualSystemPluginArtifact).mockResolvedValue(MANUAL_REVIEW);
    vi.mocked(installSystemPlugin).mockResolvedValue({
      ...INSTALL_OPERATION,
      pluginName: MANUAL_REVIEW.pluginName,
    });
    renderPage();

    await user.click(
      screen.getByRole("button", { name: "settings:SETTINGS_SYSTEM_PLUGIN_MANUAL_ACTION" }),
    );
    const packageFile = new File(["plugin archive"], "manual-plugin.zip", {
      type: "application/zip",
    });
    await user.upload(
      screen.getByLabelText("settings:SETTINGS_SYSTEM_PLUGIN_MANUAL_PACKAGE_LABEL"),
      packageFile,
    );
    await user.type(
      screen.getByPlaceholderText("settings:SETTINGS_SYSTEM_PLUGIN_MANUAL_SIGNATURE_PLACEHOLDER"),
      "signed-package",
    );
    await user.click(
      screen.getByRole("button", {
        name: "settings:SETTINGS_SYSTEM_PLUGIN_MANUAL_REVIEW_ACTION",
      }),
    );

    expect(await screen.findByText(MANUAL_REVIEW.pluginName)).toBeVisible();
    expect(screen.getByText("manual:execute")).toBeVisible();
    await user.click(
      screen.getByRole("button", {
        name: "settings:SETTINGS_SYSTEM_PLUGIN_OPERATION_INSTALL_CONFIRM",
      }),
    );

    await waitFor(() => {
      expect(reviewManualSystemPluginArtifact).toHaveBeenCalledWith(packageFile, "signed-package");
      expect(installSystemPlugin).toHaveBeenCalledWith(
        {
          sourceType: "manual_upload",
          artifactId: MANUAL_REVIEW.id,
          approvedPermissions: MANUAL_REVIEW.permissions,
        },
        expect.any(String),
      );
    });
  });
});
