import { render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { MeSettingsDialog } from "@/pages/me/dialog/me-settings-dialog";

const translations: Record<string, string> = {
  "account:ME_TITLE": "Personal center",
  "account:ME_TAB_PROFILE": "Personal Info",
  "account:ME_TAB_PROFILE_DESC": "Manage personal profile and linked accounts.",
  "account:ME_TAB_PREFERENCES": "Appearance",
  "account:ME_TAB_PREFERENCES_DESC": "Customize appearance, language, and accessibility options.",
  "account:ME_TAB_SECURITY": "Security",
  "account:ME_TAB_SECURITY_DESC": "Manage password, authentication methods, and active sessions.",
  "account:ME_TAB_NOTIFICATIONS": "Notifications",
  "account:ME_TAB_NOTIFICATIONS_DESC":
    "Choose which notifications you receive and how they are delivered.",
  "account:ME_TAB_GROUP_ACCOUNT": "account",
  "account:ME_TAB_GROUP_PREFERENCES": "PREFERENCES",
  "common:CANCEL": "Cancel",
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => translations[key] ?? key,
  }),
}));

vi.mock("@/pages/me/profile/components/me-profile-view", () => ({
  MeProfileView: () => <div>Profile content</div>,
}));

vi.mock("@/pages/me/preferences/components/me-preferences-view", () => ({
  MePreferencesView: () => <div>Preferences content</div>,
}));

vi.mock("@/pages/me/security/components/me-security-view", () => ({
  MeSecurityView: () => <div>Security content</div>,
}));

vi.mock("@/pages/me/notifications/page", () => ({
  MeNotificationSettingsPage: () => <div>Notifications content</div>,
}));

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

describe("MeSettingsDialog", () => {
  it("在右侧内容头部显示当前 tab 的 title、desc，且不渲染额外 divider", () => {
    const view = render(
      <MeSettingsDialog
        open
        tab="profile"
        onOpenChange={() => undefined}
        onTabChange={() => undefined}
      />,
    );

    const header = screen.getByTestId("me-settings-pane-header");
    const dialogOverlayRoot = document.querySelector("[data-overlay-root=dialog]");
    expect(dialogOverlayRoot).not.toBeNull();
    expect(dialogOverlayRoot).toHaveClass("pointer-events-auto");
    expect(within(header).getByText("Personal Info")).toBeInTheDocument();
    expect(
      within(header).getByText("Manage personal profile and linked accounts."),
    ).toBeInTheDocument();
    expect(screen.getByText("account")).toBeInTheDocument();
    expect(screen.getByText("PREFERENCES")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Personal Info" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Security" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Appearance" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
    expect(within(header).queryByRole("separator")).not.toBeInTheDocument();
    expect(screen.queryByText("Personal center")).not.toBeInTheDocument();
    expect(within(header).queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByText("Profile content")).toBeInTheDocument();

    view.rerender(
      <MeSettingsDialog
        open
        tab="security"
        onOpenChange={() => undefined}
        onTabChange={() => undefined}
      />,
    );

    const rerenderedHeader = screen.getByTestId("me-settings-pane-header");
    expect(within(rerenderedHeader).getByText("Security")).toBeInTheDocument();
    expect(
      within(rerenderedHeader).getByText(
        "Manage password, authentication methods, and active sessions.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Security content")).toBeInTheDocument();
  });
});
