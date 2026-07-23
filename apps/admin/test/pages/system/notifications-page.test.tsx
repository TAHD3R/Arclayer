import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SystemSettingsNotificationsPage } from "@/pages/system/notifications/page";

const { getSystemCoreSettingsMock, notifySuccessTextMock, patchSystemCoreSettingsMock } =
  vi.hoisted(() => ({
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

vi.mock("@/lib/notifications", () => ({
  notifySuccessText: (...args: unknown[]) => notifySuccessTextMock(...args),
}));

vi.mock("@/pages/system/notifications/notification-campaigns-section", () => ({
  NotificationCampaignsSection: () => (
    <section id="global-notification-campaigns">
      <h2>settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_TITLE</h2>
      <button type="button">settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_CREATE</button>
    </section>
  ),
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
  });

  it("renders system notification groups and the campaign operating surface", async () => {
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
      screen.getByText("settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_TITLE"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "settings:SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_CREATE",
      }),
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
});
