import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SystemSettingsStoragePage } from "@/pages/system/storage/page";

const {
  createStorageProfileMock,
  deleteStorageProfileMock,
  getSystemCoreSettingsMock,
  listStorageProfilesMock,
  notifyErrorMock,
  notifySuccessTextMock,
  notifyWarningTextMock,
  patchSystemCoreSettingsMock,
  testStorageProfileMock,
  updateStorageProfileMock,
} = vi.hoisted(() => ({
  listStorageProfilesMock: vi.fn(),
  getSystemCoreSettingsMock: vi.fn(),
  patchSystemCoreSettingsMock: vi.fn(),
  createStorageProfileMock: vi.fn(),
  updateStorageProfileMock: vi.fn(),
  testStorageProfileMock: vi.fn(),
  deleteStorageProfileMock: vi.fn(),
  notifyErrorMock: vi.fn(),
  notifySuccessTextMock: vi.fn(),
  notifyWarningTextMock: vi.fn(),
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

vi.mock("@/api/settings", () => ({
  getSystemCoreSettings: () => getSystemCoreSettingsMock(),
  patchSystemCoreSettings: (...args: unknown[]) => patchSystemCoreSettingsMock(...args),
}));

vi.mock("@/lib/notifications", () => ({
  notifyError: (...args: unknown[]) => notifyErrorMock(...args),
  notifySuccessText: (...args: unknown[]) => notifySuccessTextMock(...args),
  notifyWarningText: (...args: unknown[]) => notifyWarningTextMock(...args),
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

vi.mock("@/components/ui/tags", () => ({
  BaseTag: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  lucideTagIcon: () => null,
}));

vi.mock("@arclayer/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    loading,
    ...props
  }: {
    children?: React.ReactNode;
    onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
    disabled?: boolean;
    loading?: boolean;
  } & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" onClick={onClick} disabled={disabled} {...props}>
      {loading ? "loading" : null}
      {children}
    </button>
  ),
}));

vi.mock("@arclayer/ui/alert", () => ({
  Alert: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  AlertTitle: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  AlertDescription: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@arclayer/ui/empty", () => ({
  Empty: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  EmptyHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  EmptyTitle: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  EmptyDescription: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@arclayer/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuGroup: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuIconItem: ({
    children,
    disabled,
    onSelect,
  }: {
    children?: React.ReactNode;
    disabled?: boolean;
    onSelect?: () => void;
  }) => (
    <button
      type="button"
      role="menuitem"
      aria-disabled={disabled ? "true" : undefined}
      disabled={disabled}
      onClick={() => onSelect?.()}
    >
      {children}
    </button>
  ),
  DropdownMenuItem: ({
    children,
    disabled,
    onClick,
    onSelect,
  }: {
    children?: React.ReactNode;
    disabled?: boolean;
    onClick?: () => void;
    onSelect?: () => void;
  }) => (
    <button
      type="button"
      role="menuitem"
      aria-disabled={disabled ? "true" : undefined}
      disabled={disabled}
      onClick={() => {
        onClick?.();
        onSelect?.();
      }}
    >
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({ children }: { asChild?: boolean; children?: React.ReactNode }) => (
    <>{children}</>
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

vi.mock("@arclayer/ui/setting-dialog-field", () => ({
  SettingDialogFields: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  SettingDialogField: ({
    title,
    description,
    children,
  }: {
    title: React.ReactNode;
    description?: React.ReactNode;
    children?: React.ReactNode;
  }) => (
    <div>
      <div>{title}</div>
      <div>{description}</div>
      <div>{children}</div>
    </div>
  ),
}));

vi.mock("@arclayer/ui/drawer", () => ({
  Drawer: ({
    open,
    children,
  }: {
    open: boolean;
    onOpenChange?: (open: boolean) => void;
    direction?: string;
    children?: React.ReactNode;
  }) => (open ? <div>{children}</div> : null),
  DrawerContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DrawerHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DrawerTitle: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DrawerDescription: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DrawerBody: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DrawerFooter: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@arclayer/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock("@arclayer/ui/number-input", () => ({
  NumberInput: ({
    value,
    onValueChange,
    ...props
  }: {
    value?: number;
    onValueChange?: (value: number | null) => void;
  } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) => (
    <input
      {...props}
      type="number"
      value={value ?? ""}
      onChange={(event) => onValueChange?.(Number(event.currentTarget.value))}
    />
  ),
}));

vi.mock("@arclayer/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value?: string;
    onValueChange?: (value: string) => void;
    children?: React.ReactNode;
  }) => (
    <div data-value={value} data-testid="select-root">
      <button type="button" onClick={() => onValueChange?.("aws_s3")}>
        select-aws_s3
      </button>
      <button type="button" onClick={() => onValueChange?.("minio")}>
        select-minio
      </button>
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: { children?: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
  SelectValue: () => <span>select-value</span>,
  SelectContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children, value }: { children?: React.ReactNode; value?: string }) => (
    <div data-value={value}>{children}</div>
  ),
}));

vi.mock("@arclayer/ui/switch", () => ({
  Switch: ({
    checked,
    onCheckedChange,
  }: {
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
  }) => (
    <button type="button" aria-pressed={checked} onClick={() => onCheckedChange?.(!checked)}>
      switch
    </button>
  ),
}));

vi.mock("@arclayer/ui/data-table", async () => {
  const actual =
    await vi.importActual<typeof import("@arclayer/ui/data-table")>("@arclayer/ui/data-table");
  return {
    ...actual,
    DataTablePresenter: ({
      table,
      columnMenuLabels,
    }: {
      table: ReturnType<typeof import("@tanstack/react-table").useReactTable>;
      columnMenuLabels?: Record<string, string>;
    }) => (
      <table>
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th key={header.id}>
                  {typeof header.column.columnDef.header === "function"
                    ? String(header.column.id)
                    : header.column.columnDef.header}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id}>
                  {typeof cell.column.columnDef.cell === "function"
                    ? cell.column.columnDef.cell(cell.getContext())
                    : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <caption>{columnMenuLabels?.wrapContent}</caption>
      </table>
    ),
  };
});

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
    getSystemCoreSettingsMock.mockResolvedValue({
      value: { storage: {} },
      secrets: {},
    });
    patchSystemCoreSettingsMock.mockResolvedValue({
      value: { storage: {} },
      secrets: {},
    });
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
      await screen.findAllByText("settings:SETTINGS_SYSTEM_STORAGE_EMPTY_TITLE"),
    ).not.toHaveLength(0);
    expect(screen.getAllByText("settings:SETTINGS_SYSTEM_STORAGE_EMPTY_DESC")).not.toHaveLength(0);
    expect(screen.getAllByText("settings:SETTINGS_SYSTEM_STORAGE_CREATE_ACTION")).not.toHaveLength(
      0,
    );
  });

  it("renders the current profile selector above the profiles table", async () => {
    listStorageProfilesMock.mockResolvedValue([buildProfile()]);

    const { container } = renderPage();

    const currentProfileTitle = await screen.findByText(
      "settings:SETTINGS_SYSTEM_STORAGE_CURRENT_PROFILE_TITLE",
    );
    const profilesTable = container.querySelector("table");

    expect(profilesTable).not.toBeNull();
    expect(
      currentProfileTitle.compareDocumentPosition(profilesTable as HTMLTableElement) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
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

    expect(await screen.findAllByText("Environment Default")).not.toHaveLength(0);
    expect(
      screen.queryByText("settings:SETTINGS_SYSTEM_STORAGE_BADGE_ENVIRONMENT"),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:SETTINGS_SYSTEM_STORAGE_ACTIONS_LABEL",
      }),
    );
    expect(
      screen.getByText("settings:SETTINGS_SYSTEM_STORAGE_EDIT_ACTION").closest('[role="menuitem"]'),
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByText("settings:SETTINGS_SYSTEM_STORAGE_DUPLICATE_ACTION"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("settings:SETTINGS_SYSTEM_STORAGE_DELETE_ACTION"),
    ).not.toBeInTheDocument();
  });

  it("keeps environment default test success visible after testing", async () => {
    listStorageProfilesMock.mockResolvedValue([
      buildProfile({
        id: "00000000-0000-0000-0000-000000000000",
        profileKey: "env-default",
        displayName: "Environment Default",
        provider: "local",
        lastTestStatus: null,
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
    testStorageProfileMock.mockResolvedValue({
      ok: true,
      status: "passed",
      message: "Connectivity check passed",
    });

    renderPage();

    expect(
      await screen.findByText("settings:SETTINGS_SYSTEM_STORAGE_TEST_STATUS_IDLE"),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:SETTINGS_SYSTEM_STORAGE_ACTIONS_LABEL",
      }),
    );
    fireEvent.click(screen.getByText("settings:SETTINGS_SYSTEM_STORAGE_TEST_ACTION"));

    await waitFor(() => {
      expect(
        screen.getByText("settings:SETTINGS_SYSTEM_STORAGE_TEST_STATUS_PASSED"),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByText("settings:SETTINGS_SYSTEM_STORAGE_TEST_STATUS_IDLE"),
    ).not.toBeInTheDocument();
  });

  it("shows pending state while testing a profile", async () => {
    listStorageProfilesMock.mockResolvedValue([buildProfile()]);
    testStorageProfileMock.mockImplementation(() => new Promise(() => {}));

    renderPage();

    expect(await screen.findAllByText("Primary storage")).not.toHaveLength(0);
    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:SETTINGS_SYSTEM_STORAGE_ACTIONS_LABEL",
      }),
    );
    fireEvent.click(screen.getByText("settings:SETTINGS_SYSTEM_STORAGE_TEST_ACTION"));

    expect(screen.getByText("settings:SETTINGS_SYSTEM_STORAGE_STATUS_PENDING")).toBeInTheDocument();
  });

  it("shows failed connectivity in the status column without a separate connection column", async () => {
    listStorageProfilesMock.mockResolvedValue([
      buildProfile({
        lastTestStatus: "failed",
        lastTestMessage: "endpoint_url is required when provider=aws_s3",
        lastTestedAt: "2026-04-25T10:30:00Z",
      }),
    ]);

    renderPage();

    expect(
      await screen.findByText("settings:SETTINGS_SYSTEM_STORAGE_TEST_STATUS_FAILED"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("settings:SETTINGS_SYSTEM_STORAGE_TABLE_CONNECTION"),
    ).not.toBeInTheDocument();
  });

  it("uses warning semantics when an explicit connectivity test returns failed", async () => {
    listStorageProfilesMock.mockResolvedValue([buildProfile()]);
    testStorageProfileMock.mockResolvedValue({
      ok: false,
      status: "failed",
      message: "endpoint_url is required when provider=aws_s3",
    });

    renderPage();

    expect(await screen.findAllByText("Primary storage")).not.toHaveLength(0);
    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:SETTINGS_SYSTEM_STORAGE_ACTIONS_LABEL",
      }),
    );
    fireEvent.click(screen.getByText("settings:SETTINGS_SYSTEM_STORAGE_TEST_ACTION"));

    await waitFor(() => {
      expect(notifyWarningTextMock).toHaveBeenCalledWith(
        "endpoint_url is required when provider=aws_s3",
      );
    });
    expect(notifySuccessTextMock).not.toHaveBeenCalledWith(
      "endpoint_url is required when provider=aws_s3",
    );
  });

  it("saves upload purpose policies as storage.upload_policy", async () => {
    listStorageProfilesMock.mockResolvedValue([buildProfile()]);
    getSystemCoreSettingsMock.mockResolvedValue({
      value: {
        storage: {
          upload_chunk_size_mb: 8,
          upload_session_ttl_seconds: 3600,
          recycle_bin_retention_days: 90,
          upload_policy: {
            defaults: {
              max_size_mb: 2048,
              allowed_extensions: ["jpg", "png", "pdf"],
            },
            purposes: {
              avatar: {
                max_size_mb: 10,
                allowed_extensions: ["jpg", "png"],
              },
            },
          },
        },
      },
      secrets: {},
    });

    renderPage();

    const defaultExtensions = await screen.findByLabelText(
      "settings:SETTINGS_STORAGE_UPLOAD_POLICY_DEFAULTS_LABEL settings:SETTINGS_STORAGE_UPLOAD_POLICY_ALLOWED_EXTENSIONS",
    );
    fireEvent.change(defaultExtensions, { target: { value: "jpg, png, webp, pdf" } });
    fireEvent.keyDown(defaultExtensions, { key: "Enter" });
    fireEvent.change(
      screen.getByLabelText(
        "settings:SETTINGS_STORAGE_UPLOAD_POLICY_AVATAR_LABEL settings:SETTINGS_STORAGE_UPLOAD_POLICY_MAX_SIZE_MB",
      ),
      { target: { value: "12" } },
    );
    fireEvent.change(
      screen.getByLabelText(
        "settings:SETTINGS_STORAGE_UPLOAD_POLICY_FAVICON_LABEL settings:SETTINGS_STORAGE_UPLOAD_POLICY_ALLOWED_EXTENSIONS",
      ),
      { target: { value: "ico, png" } },
    );
    fireEvent.keyDown(
      screen.getByLabelText(
        "settings:SETTINGS_STORAGE_UPLOAD_POLICY_FAVICON_LABEL settings:SETTINGS_STORAGE_UPLOAD_POLICY_ALLOWED_EXTENSIONS",
      ),
      { key: "Enter" },
    );

    fireEvent.click(screen.getByRole("button", { name: "settings:SETTINGS_SAVE" }));

    await waitFor(() => {
      expect(patchSystemCoreSettingsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          storage: expect.objectContaining({
            upload_chunk_size_mb: 8,
            upload_session_ttl_seconds: 3600,
            recycle_bin_retention_days: 90,
            upload_policy: expect.objectContaining({
              defaults: {
                max_size_mb: 2048,
                allowed_extensions: ["jpg", "png", "pdf", "webp"],
              },
              purposes: expect.objectContaining({
                avatar: {
                  max_size_mb: 12,
                  allowed_extensions: ["jpg", "png"],
                },
                favicon: {
                  max_size_mb: 2,
                  allowed_extensions: ["ico", "png"],
                },
              }),
            }),
          }),
        }),
      );
    });
  });

  it("creates aws_s3 profiles with endpoint and tests the created profile once", async () => {
    listStorageProfilesMock.mockResolvedValue([]);
    createStorageProfileMock.mockResolvedValue(
      buildProfile({
        id: "created-profile",
        profileKey: "rustfs-main",
        displayName: "RustFS Main",
        isDefault: false,
      }),
    );
    testStorageProfileMock.mockResolvedValue({
      ok: false,
      status: "failed",
      message: "connect ECONNREFUSED",
    });

    renderPage();

    fireEvent.click(await screen.findByText("settings:SETTINGS_SYSTEM_STORAGE_CREATE_ACTION"));
    fireEvent.change(
      screen.getByPlaceholderText("settings:SETTINGS_SYSTEM_STORAGE_PROFILE_KEY_PLACEHOLDER"),
      {
        target: { value: "rustfs-main" },
      },
    );
    fireEvent.change(
      screen.getByPlaceholderText("settings:SETTINGS_SYSTEM_STORAGE_DISPLAY_NAME_PLACEHOLDER"),
      {
        target: { value: "RustFS Main" },
      },
    );
    fireEvent.click(screen.getAllByText("select-aws_s3")[0]);
    fireEvent.change(
      screen.getByPlaceholderText("settings:SETTINGS_STORAGE_S3_ENDPOINT_URL_PLACEHOLDER"),
      {
        target: { value: "http://127.0.0.1:9000" },
      },
    );
    fireEvent.change(screen.getByPlaceholderText("us-east-1"), {
      target: { value: "us-east-1" },
    });
    fireEvent.change(screen.getByPlaceholderText("assets-private"), {
      target: { value: "assets-private" },
    });
    fireEvent.change(document.querySelector('input[name="accessKeyId"]') as HTMLInputElement, {
      target: { value: "rustfs-access" },
    });
    fireEvent.change(
      screen.getByPlaceholderText("settings:SETTINGS_MESSAGING_MAIL_PASSWORD_PLACEHOLDER"),
      {
        target: { value: "rustfs-secret" },
      },
    );
    fireEvent.click(
      screen.getAllByRole("button", { name: "settings:SETTINGS_SYSTEM_STORAGE_CREATE_ACTION" })[1],
    );

    await waitFor(() => {
      expect(createStorageProfileMock).toHaveBeenCalled();
    });
    expect(createStorageProfileMock.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        profileKey: "rustfs-main",
        provider: "aws_s3",
        config: expect.objectContaining({
          endpointUrl: "http://127.0.0.1:9000",
          bucket: "assets-private",
          accessKeyId: "rustfs-access",
          secretAccessKey: "rustfs-secret",
        }),
      }),
    );
    await waitFor(() => {
      expect(testStorageProfileMock).toHaveBeenCalled();
    });
    expect(testStorageProfileMock.mock.calls[0][0]).toEqual(
      expect.objectContaining({ profileKey: "rustfs-main" }),
    );
    expect(notifyWarningTextMock).toHaveBeenCalledWith(
      "settings:SETTINGS_SYSTEM_STORAGE_CREATE_TEST_FAILED",
    );
  });
});
