import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getMyNotificationPreferences, patchMyNotificationPreference } from "@/api/notifications";
import { UserNotificationSettingsView } from "@/pages/usercenter/notifications/components/user-notification-settings-view";
import type { NotificationPreferences, NotificationPreferenceTopic } from "@/types/api";

vi.mock("@/api/notifications", () => ({
  getMyNotificationPreferences: vi.fn(),
  patchMyNotificationPreference: vi.fn(),
}));

vi.mock("@/lib/notifications", () => ({
  notifyError: vi.fn(),
}));

const tDict: Record<string, string> = {
  "account:ME_TAB_NOTIFICATIONS": "Notifications",
  "account:ME_NOTIFY_CHANNEL_IN_APP_TITLE": "In-App",
  "account:ME_NOTIFY_CHANNEL_IN_APP_DESC": "Delivered from the sidebar inbox entry.",
  "account:ME_NOTIFY_EMAIL_PANEL_TITLE": "Email",
  "account:ME_NOTIFY_EMAIL_PANEL_DESC": "Delivered to account email when supported.",
  "account:ME_NOTIFY_TOPIC_GENERIC_TITLE": "Notification event",
  "account:ME_NOTIFY_TOPIC_GENERIC_DESC": "Configure this event.",
  "account:ME_NOTIFY_TOPIC_WORKSPACE_INVITATION_ACCEPTED_TITLE": "Invitation accepted",
  "account:ME_NOTIFY_TOPIC_WORKSPACE_INVITATION_ACCEPTED_DESC":
    "When someone accepts an invitation that I issued.",
  "account:ME_NOTIFY_TOPIC_WORKSPACE_MEMBER_ROLES_UPDATED_TITLE": "Workspace roles updated",
  "account:ME_NOTIFY_TOPIC_WORKSPACE_MEMBER_ROLES_UPDATED_DESC":
    "When your workspace role assignments change.",
  "account:ME_NOTIFY_COL_TYPE": "Notification Type",
  "account:ME_NOTIFY_BULK_ACTIONS": "Bulk",
  "account:ME_NOTIFY_BULK_TRIGGER_ARIA": "Bulk actions for {{channel}}",
  "account:ME_NOTIFY_CELL_TOGGLE_ARIA": "{{topic}} · {{channel}}",
  "common:EMPTY_TITLE": "No data",
  "common:EMPTY_DESC": "No data found",
  "common:SELECT_ALL": "Select all",
  "common:SELECT_NONE": "Select none",
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const template = tDict[key] ?? key;
      if (!options) {
        return template;
      }
      return template.replace(/\{\{(\w+)\}\}/g, (_, token: string) => String(options[token] ?? ""));
    },
  }),
}));

const getMyNotificationPreferencesMock = vi.mocked(getMyNotificationPreferences);
const patchMyNotificationPreferenceMock = vi.mocked(patchMyNotificationPreference);

let currentPreferences: NotificationPreferences;

function clonePreferences(value: NotificationPreferences): NotificationPreferences {
  return JSON.parse(JSON.stringify(value)) as NotificationPreferences;
}

function makeTopic(params: {
  key: string;
  titleI18n?: string;
  descriptionI18n?: string;
  inApp?: Partial<NotificationPreferenceTopic["channels"]["in_app"]>;
  email?: Partial<NotificationPreferenceTopic["channels"]["email"]>;
}): NotificationPreferenceTopic {
  return {
    key: params.key,
    category: "team",
    titleI18n: params.titleI18n ?? `account:${params.key.replaceAll(".", "_").toUpperCase()}_TITLE`,
    descriptionI18n:
      params.descriptionI18n ?? `account:${params.key.replaceAll(".", "_").toUpperCase()}_DESC`,
    channels: {
      in_app: {
        enabled: false,
        supported: true,
        mutable: true,
        ...params.inApp,
      },
      email: {
        enabled: false,
        supported: true,
        mutable: true,
        ...params.email,
      },
    },
  };
}

function renderSettings(mode: "page" | "dialog" = "dialog") {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <UserNotificationSettingsView mode={mode} />
    </QueryClientProvider>,
  );
}

describe("UserNotificationSettingsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentPreferences = {
      topics: [
        makeTopic({
          key: "workspace.invitation.accepted",
          titleI18n: "account:ME_NOTIFY_TOPIC_WORKSPACE_INVITATION_ACCEPTED_TITLE",
          descriptionI18n: "account:ME_NOTIFY_TOPIC_WORKSPACE_INVITATION_ACCEPTED_DESC",
          inApp: { enabled: true },
          email: { enabled: false, supported: false, mutable: false },
        }),
      ],
    };

    getMyNotificationPreferencesMock.mockImplementation(async () =>
      clonePreferences(currentPreferences),
    );
    patchMyNotificationPreferenceMock.mockImplementation(async ({ topicKey, channel, enabled }) => {
      currentPreferences = {
        topics: currentPreferences.topics.map((topic) =>
          topic.key === topicKey
            ? {
                ...topic,
                channels: {
                  ...topic.channels,
                  [channel]: {
                    ...topic.channels[channel],
                    enabled,
                  },
                },
              }
            : topic,
        ),
      };
      return clonePreferences(currentPreferences);
    });
  });

  it("renders a matrix with visible row descriptions and hover tooltips on channel labels", async () => {
    const user = userEvent.setup();
    renderSettings();

    expect(await screen.findByText("Notification Type")).toBeInTheDocument();
    expect(screen.getByText("In-App")).toBeInTheDocument();
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(
      screen.getByText("When someone accepts an invitation that I issued."),
    ).toBeInTheDocument();

    await user.hover(screen.getByRole("button", { name: "In-App" }));

    expect(await screen.findByText("Delivered from the sidebar inbox entry.")).toBeInTheDocument();
  });

  it("patches a single channel from the matrix checkbox", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(await screen.findByRole("checkbox", { name: "Invitation accepted · In-App" }));

    await waitFor(() => {
      expect(patchMyNotificationPreferenceMock).toHaveBeenCalledWith({
        topicKey: "workspace.invitation.accepted",
        channel: "in_app",
        enabled: false,
      });
    });
  });

  it("bulk selects an entire channel from the column trigger", async () => {
    const user = userEvent.setup();
    currentPreferences = {
      topics: [
        makeTopic({
          key: "workspace.invitation.accepted",
          titleI18n: "account:ME_NOTIFY_TOPIC_WORKSPACE_INVITATION_ACCEPTED_TITLE",
          descriptionI18n: "account:ME_NOTIFY_TOPIC_WORKSPACE_INVITATION_ACCEPTED_DESC",
          inApp: { enabled: false },
        }),
        makeTopic({
          key: "workspace.member.roles.updated",
          titleI18n: "account:ME_NOTIFY_TOPIC_WORKSPACE_MEMBER_ROLES_UPDATED_TITLE",
          descriptionI18n: "account:ME_NOTIFY_TOPIC_WORKSPACE_MEMBER_ROLES_UPDATED_DESC",
          inApp: { enabled: false },
        }),
      ],
    };

    renderSettings();

    await user.click(await screen.findByRole("button", { name: "Bulk actions for In-App" }));
    await user.click(await screen.findByRole("menuitem", { name: "Select all" }));

    await waitFor(() => {
      expect(patchMyNotificationPreferenceMock).toHaveBeenCalledTimes(2);
    });
    expect(patchMyNotificationPreferenceMock.mock.calls[0]?.[0]).toEqual({
      topicKey: "workspace.invitation.accepted",
      channel: "in_app",
      enabled: true,
    });
    expect(patchMyNotificationPreferenceMock.mock.calls[1]?.[0]).toEqual({
      topicKey: "workspace.member.roles.updated",
      channel: "in_app",
      enabled: true,
    });
  });

  it("uses semantic i18n fallback when backend omits topic i18n keys", async () => {
    currentPreferences = {
      topics: [
        makeTopic({
          key: "workspace.member.roles.updated",
          titleI18n: undefined,
          descriptionI18n: undefined,
        }),
      ],
    };

    renderSettings();

    expect(await screen.findByText("Workspace roles updated")).toBeInTheDocument();
    expect(screen.queryByText("workspace.member.roles.updated")).toBeNull();
  });

  it("page mode keeps the matrix and omits category navigation", async () => {
    renderSettings("page");

    expect(await screen.findByText("Notification Type")).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).toBeNull();
  });
});
