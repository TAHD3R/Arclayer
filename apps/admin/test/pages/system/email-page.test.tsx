import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SystemSettingsEmailPage } from "@/pages/system/email/page";

const {
  getSystemCoreSettingsMock,
  listMailProvidersMock,
  notifyErrorMock,
  notifyErrorTextMock,
  notifySuccessTextMock,
  patchSystemCoreSettingsMock,
  sendTestEmailMock,
  switchMailProviderMock,
} = vi.hoisted(() => ({
  getSystemCoreSettingsMock: vi.fn(),
  patchSystemCoreSettingsMock: vi.fn(),
  listMailProvidersMock: vi.fn(),
  switchMailProviderMock: vi.fn(),
  sendTestEmailMock: vi.fn(),
  notifyErrorMock: vi.fn(),
  notifyErrorTextMock: vi.fn(),
  notifySuccessTextMock: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        "settings:SES_REGION_REQUIRED": "AWS region is required",
        "settings:MAIL_SEND_FAILED": "Mail send failed",
      };
      if (options?.provider) return `${key}:${String(options.provider)}`;
      return translations[key] ?? key;
    },
  }),
}));

vi.mock("@/api/mail", () => ({
  listMailProviders: () => listMailProvidersMock(),
  switchMailProvider: (...args: unknown[]) => switchMailProviderMock(...args),
  sendTestEmail: (...args: unknown[]) => sendTestEmailMock(...args),
}));

vi.mock("@/api/settings", () => ({
  getSystemCoreSettings: () => getSystemCoreSettingsMock(),
  patchSystemCoreSettings: (...args: unknown[]) => patchSystemCoreSettingsMock(...args),
}));

vi.mock("@/lib/notifications", () => ({
  notifyError: (...args: unknown[]) => notifyErrorMock(...args),
  notifyErrorText: (...args: unknown[]) => notifyErrorTextMock(...args),
  notifySuccessText: (...args: unknown[]) => notifySuccessTextMock(...args),
}));

vi.mock("@/layouts/page-shell/content-guard", () => ({
  ContentGuard: ({
    loading,
    error,
    children,
  }: {
    loading?: boolean;
    error?: unknown;
    children?: React.ReactNode;
  }) => {
    if (loading) return <div>loading</div>;
    if (error) return <div>error</div>;
    return <div>{children}</div>;
  },
}));

vi.mock("@/components/ui/tags", () => ({
  BaseTag: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  lucideTagIcon: () => null,
}));

vi.mock("@arclayer/ui/button", () => ({
  Button: ({
    children,
    disabled,
    loading,
    onClick,
    ...props
  }: {
    children?: React.ReactNode;
    disabled?: boolean;
    loading?: boolean;
    onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  } & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" disabled={disabled} onClick={onClick} {...props}>
      {loading ? "loading" : null}
      {children}
    </button>
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
    onSelect?: (event: { preventDefault: () => void }) => void;
  }) => (
    <button
      type="button"
      role="menuitem"
      aria-disabled={disabled ? "true" : undefined}
      disabled={disabled}
      onClick={() => onSelect?.({ preventDefault: () => undefined })}
    >
      {children}
    </button>
  ),
  DropdownMenuTrigger: ({ children }: { asChild?: boolean; children?: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("@arclayer/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock("@arclayer/ui/combobox", () => ({
  Combobox: ({
    children,
    value,
    onValueChange,
  }: {
    children?: React.ReactNode;
    value?: Array<{ value: string; label: string }>;
    onValueChange?: (value: Array<{ value: string; label: string }>) => void;
  }) => (
    <div data-testid="combobox" data-value={(value ?? []).map((item) => item.value).join(",")}>
      {children}
      <button
        type="button"
        onClick={() => onValueChange?.([...(value ?? []), { value: "resend", label: "Resend" }])}
      >
        add-combobox-resend
      </button>
      <button type="button" onClick={() => onValueChange?.([])}>
        clear-combobox
      </button>
    </div>
  ),
  ComboboxChip: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  ComboboxChips: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  ComboboxChipsInput: ({
    showClear,
    ...props
  }: React.InputHTMLAttributes<HTMLInputElement> & { showClear?: boolean }) => (
    <div>
      <input {...props} />
      {showClear ? <button type="button">combobox-clear</button> : null}
    </div>
  ),
  ComboboxContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  ComboboxEmpty: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  ComboboxItem: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  ComboboxList: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  ComboboxValue: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  useComboboxAnchor: () => useRef<HTMLDivElement | null>(null),
}));

vi.mock("@arclayer/ui/setting-dialog-field", () => ({
  SettingDialogFields: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="setting-dialog-fields">{children}</div>
  ),
  SettingDialogField: ({
    title,
    description,
    error,
    children,
  }: {
    title: React.ReactNode;
    description?: React.ReactNode;
    error?: React.ReactNode;
    children?: React.ReactNode;
  }) => (
    <label>
      <span>{title}</span>
      <span>{description}</span>
      {children}
      {error}
    </label>
  ),
}));

vi.mock("@arclayer/ui/switch", () => ({
  Switch: ({
    checked,
    disabled,
    onCheckedChange,
  }: {
    checked?: boolean;
    disabled?: boolean;
    onCheckedChange?: (checked: boolean) => void;
  }) => (
    <button
      type="button"
      aria-pressed={checked}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
    >
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
    }: {
      table: ReturnType<typeof import("@tanstack/react-table").useReactTable>;
    }) => (
      <table>
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th key={header.id}>
                  {typeof header.column.columnDef.header === "function"
                    ? header.id
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
      <SystemSettingsEmailPage />
    </QueryClientProvider>,
  );
}

function buildCoreSettings(enabled = true) {
  return {
    value: {
      mail: {
        enabled,
        provider: "smtp",
        providers: {
          smtp: {
            server: "smtp.example.com",
            port: 587,
            username: "smtp-user",
            use_credentials: true,
            mail_from: "smtp@example.com",
            mail_from_name: "SMTP Sender",
            starttls: true,
            ssl_tls: false,
          },
          resend: {
            mail_from: "resend@example.com",
            mail_from_name: "Resend Sender",
          },
        },
        retry: { max_attempts: 3, backoff_seconds: [1, 2, 4] },
        fallback_chain: ["smtp"],
        preferences: { enabled_templates: ["welcome_email"] },
      },
    },
    secrets: {
      "mail.password": true,
      "mail.providers.resend.api_key": true,
    },
  };
}

function buildProviders() {
  return [
    {
      provider_id: "smtp",
      label: "SMTP",
      active: true,
      configured: true,
      available: true,
    },
    {
      provider_id: "resend",
      label: "Resend",
      active: false,
      configured: true,
      available: true,
    },
  ];
}

describe("SystemSettingsEmailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSystemCoreSettingsMock.mockResolvedValue(buildCoreSettings(true));
    patchSystemCoreSettingsMock.mockResolvedValue(buildCoreSettings(true));
    listMailProvidersMock.mockResolvedValue(buildProviders());
    switchMailProviderMock.mockResolvedValue(buildProviders());
    sendTestEmailMock.mockResolvedValue({ ok: true, provider: "smtp" });
  });

  it("hides provider, policy, templates, and test sections when mail is disabled", async () => {
    getSystemCoreSettingsMock.mockResolvedValue(buildCoreSettings(false));

    renderPage();

    await waitFor(() => {
      expect(
        screen.getAllByText("settings:SETTINGS_SYSTEM_EMAIL_DELIVERY_SECTION_TITLE"),
      ).not.toHaveLength(0);
    });
    expect(screen.getByText("settings:SETTINGS_MESSAGING_MAIL_ENABLED_TITLE")).toBeInTheDocument();
    expect(screen.queryByText("settings:SETTINGS_SYSTEM_EMAIL_PROVIDERS_TITLE")).toBeNull();
    expect(screen.queryByText("settings:SETTINGS_MESSAGING_MAIL_DELIVERY_POLICY_TITLE")).toBeNull();
    expect(
      screen.queryByText("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_PREFERENCES_TITLE"),
    ).toBeNull();
    expect(screen.queryByText("settings:SETTINGS_MESSAGING_MAIL_TEST_TITLE")).toBeNull();
  });

  it("renders providers as a table with current provider tag and ellipsis actions", async () => {
    renderPage();

    expect(
      await screen.findByText("settings:SETTINGS_SYSTEM_EMAIL_PROVIDERS_TITLE"),
    ).toBeInTheDocument();
    expect(screen.getByText("SMTP")).toBeInTheDocument();
    expect(screen.getByText("Resend")).toBeInTheDocument();
    expect(
      screen.getByText("settings:SETTINGS_MESSAGING_MAIL_PROVIDER_ACTIVE"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", {
        name: "settings:SETTINGS_SYSTEM_EMAIL_PROVIDER_ACTIONS_LABEL",
      }),
    ).toHaveLength(2);
  });

  it("sets a non-current provider active from the row menu", async () => {
    renderPage();

    expect(await screen.findByText("Resend")).toBeInTheDocument();
    fireEvent.click(
      screen.getAllByText("settings:SETTINGS_SYSTEM_EMAIL_PROVIDER_SET_ACTIVE_ACTION")[1],
    );

    await waitFor(() => {
      expect(switchMailProviderMock).toHaveBeenCalledWith({ provider: "resend" });
    });
    expect(patchSystemCoreSettingsMock).not.toHaveBeenCalledWith({ mail: { provider: "resend" } });
    expect(notifySuccessTextMock).toHaveBeenCalledWith(
      "settings:SETTINGS_SYSTEM_EMAIL_PROVIDER_ACTIVATED:settings:SETTINGS_MESSAGING_MAIL_PROVIDER_RESEND",
    );
  });

  it("keeps unavailable providers disabled in the row menu", async () => {
    listMailProvidersMock.mockResolvedValue([
      {
        provider_id: "smtp",
        label: "SMTP",
        active: true,
        configured: true,
        available: true,
      },
      {
        provider_id: "ses",
        label: "Amazon SES",
        active: false,
        configured: false,
        available: false,
        error: "SES_REGION_REQUIRED",
      },
    ]);

    renderPage();

    expect(await screen.findByText("Amazon SES")).toBeInTheDocument();
    const enableActions = screen.getAllByText(
      "settings:SETTINGS_SYSTEM_EMAIL_PROVIDER_SET_ACTIVE_ACTION",
    );
    expect(enableActions[1]).toBeDisabled();
  });

  it("shows a localized toast when provider activation fails", async () => {
    switchMailProviderMock.mockRejectedValue(new Error("MAIL_SEND_FAILED"));

    renderPage();

    expect(await screen.findByText("Resend")).toBeInTheDocument();
    fireEvent.click(
      screen.getAllByText("settings:SETTINGS_SYSTEM_EMAIL_PROVIDER_SET_ACTIVE_ACTION")[1],
    );

    await waitFor(() => {
      expect(notifyErrorTextMock).toHaveBeenCalledWith("Mail send failed");
    });
    expect(notifyErrorMock).not.toHaveBeenCalled();
    expect(notifySuccessTextMock).not.toHaveBeenCalledWith(
      expect.stringContaining("SETTINGS_SYSTEM_EMAIL_PROVIDER_ACTIVATED"),
    );
  });

  it("shows configured providers as pending test until a test succeeds", async () => {
    renderPage();

    expect(
      await screen.findByText("settings:SETTINGS_SYSTEM_EMAIL_PROVIDERS_TITLE"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("settings:SETTINGS_SYSTEM_EMAIL_PROVIDER_CONFIGURED_NOT_TESTED"),
    ).not.toHaveLength(0);

    fireEvent.change(
      screen.getByPlaceholderText("settings:SETTINGS_MESSAGING_MAIL_TEST_PLACEHOLDER"),
      {
        target: { value: "ops@example.com" },
      },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "settings:SETTINGS_MESSAGING_MAIL_TEST_ACTION" }),
    );

    await waitFor(() => {
      expect(sendTestEmailMock).toHaveBeenCalledWith({ recipient: "ops@example.com" });
    });
    expect(
      await screen.findByText("settings:SETTINGS_SYSTEM_EMAIL_PROVIDER_AVAILABLE"),
    ).toBeInTheDocument();
  });

  it("keeps persisted provider test status after provider data reloads", async () => {
    listMailProvidersMock.mockResolvedValue([
      {
        provider_id: "smtp",
        label: "SMTP",
        active: true,
        configured: true,
        available: true,
        last_test_status: "passed",
        last_test_message: null,
        last_tested_at: "2026-05-07T10:00:00Z",
      },
      {
        provider_id: "resend",
        label: "Resend",
        active: false,
        configured: true,
        available: true,
      },
    ]);

    renderPage();

    expect(
      await screen.findByText("settings:SETTINGS_SYSTEM_EMAIL_PROVIDER_AVAILABLE"),
    ).toBeInTheDocument();
    expect(
      screen.queryAllByText("settings:SETTINGS_SYSTEM_EMAIL_PROVIDER_CONFIGURED_NOT_TESTED"),
    ).toHaveLength(1);
  });

  it("marks the active provider test as failed when the test request fails", async () => {
    sendTestEmailMock.mockRejectedValue(new Error("MAIL_SEND_FAILED"));

    renderPage();

    fireEvent.change(
      await screen.findByPlaceholderText("settings:SETTINGS_MESSAGING_MAIL_TEST_PLACEHOLDER"),
      {
        target: { value: "ops@example.com" },
      },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "settings:SETTINGS_MESSAGING_MAIL_TEST_ACTION" }),
    );

    expect(
      await screen.findByText("settings:SETTINGS_SYSTEM_EMAIL_PROVIDER_TEST_FAILED"),
    ).toBeInTheDocument();
    expect(notifyErrorMock).toHaveBeenCalled();
  });

  it("configures a non-current provider in a drawer without switching it first", async () => {
    renderPage();

    expect(await screen.findByText("Resend")).toBeInTheDocument();
    fireEvent.click(
      screen.getAllByText("settings:SETTINGS_SYSTEM_EMAIL_PROVIDER_CONFIGURE_ACTION_SHORT")[1],
    );
    expect(
      screen.getByText(
        "settings:SETTINGS_SYSTEM_EMAIL_PROVIDER_CONFIG_DIALOG_TITLE:settings:SETTINGS_MESSAGING_MAIL_PROVIDER_RESEND",
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId("setting-dialog-fields")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "settings:SETTINGS_RESET" })).toBeNull();

    fireEvent.change(screen.getByDisplayValue("resend@example.com"), {
      target: { value: "ops@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "settings:SETTINGS_SAVE" }));

    await waitFor(() => {
      expect(patchSystemCoreSettingsMock).toHaveBeenCalledWith({
        mail: {
          providers: {
            resend: {
              mail_from: "ops@example.com",
              mail_from_name: "Resend Sender",
            },
          },
        },
      });
    });
    expect(switchMailProviderMock).not.toHaveBeenCalled();
  });

  it("adds fallback providers through the combobox and exposes a clear control", async () => {
    renderPage();

    expect(
      await screen.findByText("settings:SETTINGS_MESSAGING_MAIL_DELIVERY_POLICY_TITLE"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "add-combobox-resend" }));
    expect(screen.getByRole("button", { name: "combobox-clear" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "settings:SETTINGS_SAVE" }));

    await waitFor(() => {
      expect(patchSystemCoreSettingsMock).toHaveBeenCalledWith({
        mail: {
          fallback_chain: ["smtp", "resend"],
          retry: { max_attempts: 3, backoff_seconds: [1, 2, 4] },
        },
      });
    });
  });

  it("localizes required provider configuration errors", async () => {
    getSystemCoreSettingsMock.mockResolvedValue({
      ...buildCoreSettings(true),
      secrets: {},
    });

    renderPage();

    expect(await screen.findByText("Resend")).toBeInTheDocument();
    fireEvent.click(
      screen.getAllByText("settings:SETTINGS_SYSTEM_EMAIL_PROVIDER_CONFIGURE_ACTION_SHORT")[1],
    );
    fireEvent.change(screen.getByDisplayValue("resend@example.com"), {
      target: { value: "ops@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "settings:SETTINGS_SAVE" }));

    await waitFor(() => {
      expect(notifyErrorMock).toHaveBeenCalledWith(expect.any(Error));
    });
    const notifiedError = notifyErrorMock.mock.calls[0][0] as Error;
    expect(notifiedError.message).toBe("settings:RESEND_API_KEY_REQUIRED");
  });

  it("localizes provider row errors and uses short menu labels", async () => {
    listMailProvidersMock.mockResolvedValue([
      {
        provider_id: "smtp",
        label: "SMTP",
        active: true,
        configured: true,
        available: true,
      },
      {
        provider_id: "ses",
        label: "Amazon SES",
        active: false,
        configured: false,
        available: false,
        error: "SES_REGION_REQUIRED",
      },
    ]);

    renderPage();

    expect(await screen.findByText("Amazon SES")).toBeInTheDocument();
    expect(screen.getByText("AWS region is required")).toBeInTheDocument();
    expect(
      screen.getAllByText("settings:SETTINGS_SYSTEM_EMAIL_PROVIDER_SET_ACTIVE_ACTION"),
    ).toHaveLength(2);
    expect(
      screen.getAllByText("settings:SETTINGS_SYSTEM_EMAIL_PROVIDER_CONFIGURE_ACTION_SHORT"),
    ).toHaveLength(2);
  });

  it("uses switches for template delivery and keeps save/reset semantics", async () => {
    renderPage();

    expect(
      await screen.findByText("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_PREFERENCES_TITLE"),
    ).toBeInTheDocument();
    const templateSwitches = screen.getAllByRole("button", { name: "switch" });
    fireEvent.click(templateSwitches[1]);

    expect(patchSystemCoreSettingsMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "settings:SETTINGS_SAVE" }));

    await waitFor(() => {
      expect(patchSystemCoreSettingsMock).toHaveBeenCalledWith({
        mail: { preferences: { enabled_templates: ["welcome_email", "registration_prompt"] } },
      });
    });
  });
});
