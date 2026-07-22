import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SystemSettingsNotificationsPage } from "@/pages/system/notifications/page";

const {
  createGlobalNotificationBroadcastMock,
  getSystemCoreSettingsMock,
  notifySuccessTextMock,
  patchSystemCoreSettingsMock,
} = vi.hoisted(() => ({
  createGlobalNotificationBroadcastMock: vi.fn(),
  getSystemCoreSettingsMock: vi.fn(),
  patchSystemCoreSettingsMock: vi.fn(),
  notifySuccessTextMock: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/api/settings", () => ({
  getSystemCoreSettings: () => getSystemCoreSettingsMock(),
  patchSystemCoreSettings: (...args: unknown[]) => patchSystemCoreSettingsMock(...args),
}));

vi.mock("@/api/notifications", () => ({
  createGlobalNotificationBroadcast: (payload: unknown) =>
    createGlobalNotificationBroadcastMock(payload),
}));

vi.mock("@/lib/notifications", () => ({
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

vi.mock("@/pages/system/components/system-setting-item", () => ({
  SystemSettingStack: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  SystemSettingItem: ({
    id,
    title,
    description,
    children,
    footer,
  }: {
    id: string;
    title: React.ReactNode;
    description?: React.ReactNode;
    children?: React.ReactNode;
    footer?: React.ReactNode;
  }) => (
    <section id={id}>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {children}
      {footer}
    </section>
  ),
  SystemSettingFooterActions: ({
    dirty,
    pending,
    onReset,
    onSave,
  }: {
    dirty: boolean;
    pending?: boolean;
    onReset: () => void;
    onSave: () => void;
  }) =>
    dirty ? (
      <div>
        <button type="button" disabled={pending} onClick={onReset}>
          settings:SETTINGS_RESET
        </button>
        <button type="button" disabled={pending} onClick={onSave}>
          settings:SETTINGS_SAVE
        </button>
      </div>
    ) : null,
  SystemSettingField: ({
    label,
    message,
    children,
    labelControls = true,
  }: {
    label: React.ReactNode;
    message?: React.ReactNode;
    children?: React.ReactNode;
    labelControls?: boolean;
  }) =>
    labelControls ? (
      <label>
        <span>{label}</span>
        {children}
        {message}
      </label>
    ) : (
      <div>
        <span>{label}</span>
        {children}
        {message}
      </div>
    ),
}));

vi.mock("@arclayer/ui/checkbox", () => ({
  Checkbox: ({
    checked,
    onCheckedChange,
  }: {
    checked?: boolean;
    className?: string;
    onCheckedChange?: (checked: boolean) => void;
  }) => (
    <input
      type="checkbox"
      checked={Boolean(checked)}
      onChange={() => onCheckedChange?.(!checked)}
    />
  ),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SystemSettingsNotificationsPage />
    </QueryClientProvider>,
  );
}

function buildCoreSettings() {
  return {
    value: {
      notifications: {
        groups: {
          team: { enabled: true },
          security: { enabled: true },
          content: { enabled: true },
          automation: { enabled: true },
          system: { enabled: false },
        },
      },
    },
  };
}

describe("SystemSettingsNotificationsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSystemCoreSettingsMock.mockResolvedValue(buildCoreSettings());
    patchSystemCoreSettingsMock.mockResolvedValue(buildCoreSettings());
    createGlobalNotificationBroadcastMock.mockResolvedValue({
      broadcastId: "broadcast-1",
      policyEnabled: true,
      audienceCount: 8,
      inAppDeliveredCount: 8,
      emailDeliveredCount: 6,
    });
  });

  it("renders system notification groups and the global broadcast form", async () => {
    renderPage();

    expect(
      await screen.findByText("settings:SETTINGS_SYSTEM_NOTIFICATIONS_IN_APP_TITLE"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("settings:SETTINGS_SYSTEM_NOTIFICATIONS_GROUP_TEAM_TITLE"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("settings:SETTINGS_SYSTEM_NOTIFICATIONS_GROUP_SYSTEM_TITLE"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("settings:SETTINGS_SYSTEM_NOTIFICATIONS_BROADCAST_TITLE"),
    ).toBeInTheDocument();
    expect(screen.queryByText("settings:SETTINGS_SYSTEM_NOTIFICATIONS_EMAIL_TITLE")).toBeNull();
  });

  it("saves notification group policy with the canonical groups shape", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("settings:SETTINGS_SYSTEM_NOTIFICATIONS_GROUP_TEAM_TITLE");
    await user.click(
      screen.getByRole("checkbox", {
        name: /settings:SETTINGS_SYSTEM_NOTIFICATIONS_GROUP_TEAM_TITLE/,
      }),
    );
    await user.click(screen.getByRole("button", { name: "settings:SETTINGS_SAVE" }));

    await waitFor(() => {
      expect(patchSystemCoreSettingsMock).toHaveBeenCalledWith({
        notifications: {
          groups: {
            team: { enabled: false },
            security: { enabled: true },
            content: { enabled: true },
            automation: { enabled: true },
            system: { enabled: false },
          },
        },
      });
    });
  });

  it("publishes a global banner through in-app and email channels", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(
      await screen.findByRole("textbox", {
        name: "settings:SETTINGS_SYSTEM_NOTIFICATIONS_BROADCAST_MESSAGE_TITLE",
      }),
      "Scheduled maintenance",
    );
    await user.type(
      screen.getByRole("textbox", {
        name: "settings:SETTINGS_SYSTEM_NOTIFICATIONS_BROADCAST_BODY",
      }),
      "Restart at 02:00 UTC.",
    );
    await user.click(
      screen.getByText("settings:SETTINGS_SYSTEM_NOTIFICATIONS_BROADCAST_PRESENTATION_BANNER"),
    );
    await user.click(
      screen.getByRole("checkbox", {
        name: "settings:SETTINGS_SYSTEM_NOTIFICATIONS_BROADCAST_CHANNEL_EMAIL",
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "settings:SETTINGS_SYSTEM_NOTIFICATIONS_BROADCAST_SEND",
      }),
    );

    await waitFor(() => {
      expect(createGlobalNotificationBroadcastMock).toHaveBeenCalledWith({
        title: "Scheduled maintenance",
        body: "Restart at 02:00 UTC.",
        presentation: "banner",
        severity: "info",
        actionLabel: null,
        actionTo: null,
        deliverInApp: true,
        deliverEmail: true,
      });
    });
    expect(
      await screen.findByText("SETTINGS_SYSTEM_NOTIFICATIONS_BROADCAST_RESULT_TITLE"),
    ).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument();
  });
});
