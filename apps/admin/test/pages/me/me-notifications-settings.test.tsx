import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getMyNotificationPreferences, patchMyNotificationPreference } from "@/api/notifications";
import { MeNotificationSettingsPage } from "@/pages/me/notifications/page";

vi.mock("@/api/notifications", () => ({
  getMyNotificationPreferences: vi.fn(),
  patchMyNotificationPreference: vi.fn(),
}));

vi.mock("@/lib/notifications", () => ({
  notifyError: vi.fn(),
}));

const tDict: Record<string, string> = {
  "account:ME_TAB_NOTIFICATIONS": "Notifications",
  "account:ME_NOTIFY_PANEL_DESC": "Manage notifications per channel.",
  "account:ME_NOTIFY_CHANNEL_IN_APP_TITLE": "In-app notifications",
  "account:ME_NOTIFY_CHANNEL_IN_APP_DESC": "Delivered from the sidebar inbox entry.",
  "account:ME_NOTIFY_EMAIL_PANEL_TITLE": "Email notifications",
  "account:ME_NOTIFY_EMAIL_PANEL_DESC": "Delivered to account email when supported.",
  "account:ME_NOTIFY_CHANNEL_OPTION_ON": "On",
  "account:ME_NOTIFY_CHANNEL_OPTION_OFF": "Off",
  "account:ME_NOTIFY_CHANNEL_OPTION_REQUIRED": "Required",
  "account:ME_NOTIFY_CHANNEL_OPTION_UNAVAILABLE": "Unavailable",
  "account:ME_NOTIFY_TOPIC_GENERIC_TITLE": "Notification event",
  "account:ME_NOTIFY_TOPIC_GENERIC_DESC": "Configure this event.",
  "account:ME_NOTIFY_TOPIC_WORKSPACE_INVITATION_ACCEPTED_TITLE": "Invitation accepted",
  "account:ME_NOTIFY_TOPIC_WORKSPACE_INVITATION_ACCEPTED_DESC":
    "When someone accepts your invitation.",
  "account:ME_NOTIFY_TOPIC_WORKSPACE_MEMBER_ROLES_UPDATED_TITLE": "Workspace roles updated",
  "account:ME_NOTIFY_TOPIC_WORKSPACE_MEMBER_ROLES_UPDATED_DESC":
    "When your workspace role assignments change.",
  "common:EMPTY_TITLE": "No data",
  "common:EMPTY_DESC": "No data found",
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => tDict[key] ?? key,
  }),
}));

const getMyNotificationPreferencesMock = vi.mocked(getMyNotificationPreferences);
const patchMyNotificationPreferenceMock = vi.mocked(patchMyNotificationPreference);

function makeTopic(enabled: boolean) {
  return {
    key: "workspace.invitation.accepted",
    category: "team",
    titleI18n: "account:ME_NOTIFY_TOPIC_WORKSPACE_INVITATION_ACCEPTED_TITLE",
    descriptionI18n: "account:ME_NOTIFY_TOPIC_WORKSPACE_INVITATION_ACCEPTED_DESC",
    channels: {
      in_app: { enabled, supported: true, mutable: true },
      email: { enabled: false, supported: false, mutable: false },
    },
  } as const;
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MeNotificationSettingsPage mode="dialog" />
    </QueryClientProvider>,
  );
}

describe("MeNotificationSettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMyNotificationPreferencesMock.mockResolvedValue({ topics: [makeTopic(true)] });
    patchMyNotificationPreferenceMock.mockImplementation(async ({ enabled }) => ({
      topics: [makeTopic(enabled)],
    }));
  });

  it("renders in-app and email sections with title/desc + switch rows", async () => {
    renderPage();

    expect(screen.queryByText("Delivery channels")).not.toBeInTheDocument();
    expect(await screen.findByText("In-app notifications")).toBeInTheDocument();
    expect(screen.getByText("Email notifications")).toBeInTheDocument();
    expect(screen.getAllByText("Invitation accepted").length).toBe(2);
    expect(screen.queryByText("workspace.invitation.accepted")).not.toBeInTheDocument();
    expect(screen.getAllByRole("switch")).toHaveLength(2);
    expect(screen.getAllByRole("switch")[1]).toBeDisabled();
  });

  it("patches in-app channel when switch value changes", async () => {
    const user = userEvent.setup();
    renderPage();

    expect((await screen.findAllByText("Invitation accepted")).length).toBeGreaterThan(0);
    const inAppSwitch = screen.getAllByRole("switch")[0];
    await user.click(inAppSwitch);

    await waitFor(() => {
      expect(patchMyNotificationPreferenceMock).toHaveBeenCalled();
    });
    expect(patchMyNotificationPreferenceMock.mock.calls[0]?.[0]).toEqual({
      topicKey: "workspace.invitation.accepted",
      channel: "in_app",
      enabled: false,
    });
  });

  it("uses semantic i18n fallback when backend omits topic i18n keys", async () => {
    getMyNotificationPreferencesMock.mockResolvedValueOnce({
      topics: [
        {
          key: "workspace.member.roles.updated",
          category: "team",
          channels: {
            in_app: { enabled: true, supported: true, mutable: true },
            email: { enabled: false, supported: false, mutable: false },
          },
        } as unknown as ReturnType<typeof makeTopic>,
      ],
    });

    renderPage();

    expect((await screen.findAllByText("Workspace roles updated")).length).toBeGreaterThan(0);
    expect(screen.queryByText("workspace.member.roles.updated")).not.toBeInTheDocument();
  });
});
