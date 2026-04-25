import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SystemSettingsStoragePage } from "@/pages/system/storage/page";

const {
  createStorageProfileMock,
  deleteStorageProfileMock,
  listStorageProfilesMock,
  notifyErrorMock,
  notifySuccessTextMock,
  testStorageProfileMock,
  updateStorageProfileMock,
} = vi.hoisted(() => ({
  listStorageProfilesMock: vi.fn(),
  createStorageProfileMock: vi.fn(),
  updateStorageProfileMock: vi.fn(),
  testStorageProfileMock: vi.fn(),
  deleteStorageProfileMock: vi.fn(),
  notifyErrorMock: vi.fn(),
  notifySuccessTextMock: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options?.name ? `${key}:${String(options.name)}` : key,
  }),
}));

vi.mock("@/api/storage-profiles", () => ({
  SYSTEM_STORAGE_PROFILES_QUERY_KEY: ["system", "storage-profiles"],
  listStorageProfiles: () => listStorageProfilesMock(),
  createStorageProfile: (...args: unknown[]) => createStorageProfileMock(...args),
  updateStorageProfile: (...args: unknown[]) => updateStorageProfileMock(...args),
  testStorageProfile: (...args: unknown[]) => testStorageProfileMock(...args),
  deleteStorageProfile: (...args: unknown[]) => deleteStorageProfileMock(...args),
}));

vi.mock("@/lib/notifications", () => ({
  notifyError: (...args: unknown[]) => notifyErrorMock(...args),
  notifySuccessText: (...args: unknown[]) => notifySuccessTextMock(...args),
}));

vi.mock("@/layouts/page-shell/content-guard", () => ({
  ContentGuard: ({
    loading,
    error,
    empty,
    emptyTitle,
    emptyDescription,
    emptyExtra,
    children,
  }: {
    loading?: boolean;
    error?: unknown;
    empty?: boolean;
    emptyTitle?: React.ReactNode;
    emptyDescription?: React.ReactNode;
    emptyExtra?: React.ReactNode;
    children?: React.ReactNode;
  }) => {
    if (loading) return <div>loading</div>;
    if (error) return <div>error</div>;
    if (empty) {
      return (
        <div>
          <div>{emptyTitle}</div>
          <div>{emptyDescription}</div>
          <div>{emptyExtra}</div>
        </div>
      );
    }
    return <div>{children}</div>;
  },
}));

vi.mock("@arclayer/ui/setting-panel", () => ({
  SettingPanel: ({
    title,
    description,
    children,
  }: {
    title: React.ReactNode;
    description?: React.ReactNode;
    children?: React.ReactNode;
  }) => (
    <section>
      <h1>{title}</h1>
      <p>{description}</p>
      <div>{children}</div>
    </section>
  ),
}));

vi.mock("@arclayer/ui/setting-action-group", () => ({
  SettingActionGroup: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@arclayer/ui/setting-action-item", () => ({
  SettingActionItem: ({
    title,
    summary,
    description,
    right,
  }: {
    title: React.ReactNode;
    summary?: React.ReactNode;
    description?: React.ReactNode;
    right?: React.ReactNode;
  }) => (
    <div>
      <div>{title}</div>
      <div>{summary}</div>
      <div>{description}</div>
      <div>{right}</div>
    </div>
  ),
}));

vi.mock("@arclayer/ui/badge", () => ({
  Badge: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock("@arclayer/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    loading,
  }: {
    children?: React.ReactNode;
    onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
    disabled?: boolean;
    loading?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {loading ? "loading" : null}
      {children}
    </button>
  ),
}));

vi.mock("@arclayer/ui/setting-dialog", () => ({
  SettingDialog: ({
    open,
    title,
    children,
    footer,
  }: {
    open: boolean;
    title: React.ReactNode;
    children?: React.ReactNode;
    footer?: React.ReactNode;
  }) =>
    open ? (
      <div>
        <div>{title}</div>
        <div>{children}</div>
        <div>{footer}</div>
      </div>
    ) : null,
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SystemSettingsStoragePage />
    </QueryClientProvider>,
  );
}

function buildProfile(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "profile-1",
    createdAt: "2026-04-25T10:00:00Z",
    updatedAt: "2026-04-25T10:00:00Z",
    displayName: "Primary storage",
    profileKey: "primary-storage",
    provider: "aws_s3",
    scopeId: "system",
    scopeType: "system",
    isActive: true,
    isDefault: true,
    lastTestStatus: null,
    lastTestMessage: null,
    lastTestedAt: null,
    secrets: { secretAccessKey: true },
    config: {
      bucket: "assets-private",
      publicBucket: "assets-public",
      publicBaseUrl: "https://cdn.example.com",
      publicDeliveryMode: "direct",
      endpointUrl: "https://s3.amazonaws.com",
      region: "us-east-1",
      accessKeyId: "key-id",
      forcePathStyle: false,
      presignExpiresSeconds: 900,
    },
    ...overrides,
  };
}

describe("SystemSettingsStoragePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createStorageProfileMock.mockResolvedValue(buildProfile());
    updateStorageProfileMock.mockResolvedValue(buildProfile());
    testStorageProfileMock.mockResolvedValue({
      ok: true,
      status: "passed",
      message: "Connectivity check passed",
    });
    deleteStorageProfileMock.mockResolvedValue({ id: "profile-1", deleted: true });
  });

  it("renders loading state while profiles are pending", () => {
    listStorageProfilesMock.mockImplementation(() => new Promise(() => {}));

    renderPage();

    expect(screen.getByText("loading")).toBeInTheDocument();
  });

  it("renders error state when query fails", async () => {
    listStorageProfilesMock.mockRejectedValue(new Error("boom"));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("error")).toBeInTheDocument();
    });
  });

  it("renders empty state when no storage profiles exist", async () => {
    listStorageProfilesMock.mockResolvedValue([]);

    renderPage();

    expect(
      await screen.findByText("settings:SETTINGS_SYSTEM_STORAGE_EMPTY_TITLE"),
    ).toBeInTheDocument();
    expect(screen.getByText("settings:SETTINGS_SYSTEM_STORAGE_EMPTY_DESC")).toBeInTheDocument();
    expect(screen.getByText("settings:SETTINGS_SYSTEM_STORAGE_CREATE_ACTION")).toBeInTheDocument();
  });

  it("renders read-only state for the environment default profile", async () => {
    listStorageProfilesMock.mockResolvedValue([
      buildProfile({
        id: "00000000-0000-0000-0000-000000000000",
        profileKey: "env-default",
        displayName: "Environment Default",
        provider: "local",
        config: {
          bucket: null,
          publicBucket: null,
          publicBaseUrl: null,
          publicDeliveryMode: "auto",
          endpointUrl: null,
          region: null,
          accessKeyId: null,
          forcePathStyle: false,
          presignExpiresSeconds: 900,
        },
      }),
    ]);

    renderPage();

    expect(await screen.findByText("Environment Default")).toBeInTheDocument();
    expect(screen.getByText("settings:SETTINGS_SYSTEM_STORAGE_ROW_READ_ONLY")).toBeInTheDocument();
    expect(
      screen.getByText((content) =>
        content.includes("settings:SETTINGS_SYSTEM_STORAGE_ENV_DEFAULT_DESC"),
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("settings:SETTINGS_REMOVE")).not.toBeInTheDocument();
  });

  it("shows pending state while testing a profile", async () => {
    listStorageProfilesMock.mockResolvedValue([buildProfile()]);
    testStorageProfileMock.mockImplementation(() => new Promise(() => {}));

    renderPage();

    expect(await screen.findByText("Primary storage")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:SETTINGS_SYSTEM_STORAGE_TEST_ACTION",
      }),
    );

    expect(screen.getByText("settings:SETTINGS_SYSTEM_STORAGE_STATUS_PENDING")).toBeInTheDocument();
  });
});
