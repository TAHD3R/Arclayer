import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UsercenterOverlayHost } from "@/components/layout/usercenter-overlay-host";

const navigateMock = vi.fn().mockResolvedValue(undefined);
const historyBackMock = vi.fn();

const overlaySearch: { personalSettings?: string } = { personalSettings: "profile" };
const routerState = {
  pathname: "/w/ws-1/assets",
  hash: "#gallery",
};

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
  useRouter: () => ({ history: { back: historyBackMock } }),
  useSearch: () => overlaySearch,
  useRouterState: ({
    select,
  }: {
    select: (state: { location: { pathname: string; hash: string } }) => unknown;
  }) => select({ location: { pathname: routerState.pathname, hash: routerState.hash } }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/pages/usercenter/profile/components/user-profile-view", () => ({
  UserProfileView: () => <div data-testid="overlay-profile-view">profile</div>,
}));

vi.mock("@/pages/usercenter/appearance/components/user-appearance-view", () => ({
  UserAppearanceView: () => <div data-testid="overlay-appearance-view">appearance</div>,
}));

vi.mock("@/pages/usercenter/notifications/components/user-notification-settings-view", () => ({
  UserNotificationSettingsView: () => (
    <div data-testid="overlay-notifications-view">notifications</div>
  ),
}));

function renderOverlayHost() {
  return render(<UsercenterOverlayHost />);
}

describe("UsercenterOverlayHost", () => {
  beforeEach(() => {
    navigateMock.mockClear();
    historyBackMock.mockClear();
    overlaySearch.personalSettings = "profile";
    routerState.pathname = "/w/ws-1/assets";
    routerState.hash = "#gallery";
    window.history.replaceState({ __TSR_index: 1 }, "");
  });

  it("renders the shared settings frame inside the overlay chrome", () => {
    renderOverlayHost();

    const closeButton = screen.getByRole("button", { name: "Close" });
    const overlayContent = screen.getByTestId("settings-shell-frame");
    const nav = screen.getByRole("navigation", { name: "account:SETTINGS_SHELL_TITLE" });

    expect(overlayContent).not.toBeNull();
    expect(overlayContent).toHaveClass(
      "h-full",
      "w-full",
      "max-w-none",
      "rounded-none",
      "border-0",
      "shadow-none",
    );
    expect(nav).toBeVisible();
    expect(closeButton).toHaveAttribute("data-variant", "ghost");
    expect(closeButton).toHaveAttribute("data-size", "icon-sm");
    expect(closeButton).toHaveClass("shrink-0");
    expect(screen.getByRole("button", { name: "account:ACCOUNT_NAV_PROFILE" })).toBeVisible();
    expect(screen.getByRole("button", { name: "account:ACCOUNT_NAV_APPEARANCE" })).toBeVisible();
    expect(screen.getByRole("button", { name: "account:ACCOUNT_NAV_NOTIFICATIONS" })).toBeVisible();
    expect(screen.getByText("account:SETTINGS_NAV_SECTION_PERSONAL")).toBeVisible();
    expect(screen.getByText("account:SETTINGS_NAV_SECTION_WORKSPACE")).toBeVisible();
    expect(screen.getByText("account:SETTINGS_NAV_WORKSPACE_GENERAL")).toBeVisible();
    expect(screen.getByText("account:ME_TAB_PROFILE")).toBeVisible();
    expect(screen.getByText("account:ME_TAB_PROFILE_DESC")).toBeVisible();
    expect(screen.getByTestId("overlay-profile-view")).toBeVisible();
    expect(screen.queryByText("个人设置")).toBeNull();
    expect(screen.queryByText("设置管理个人偏好与工作空间访问项。")).toBeNull();
    expect(screen.queryByText(/To pick up a draggable item/i)).toBeNull();
    expect(screen.getByRole("button", { name: "Close" })).toHaveClass("bg-background/80");
    expect(screen.getByRole("button", { name: "account:ACCOUNT_NAV_PROFILE" })).toHaveClass(
      "text-sm",
    );
  });

  it("switches sections by masked navigation while keeping the current background route", async () => {
    const user = userEvent.setup();
    renderOverlayHost();

    await user.click(screen.getByRole("button", { name: "account:ACCOUNT_NAV_NOTIFICATIONS" }));

    const navigation = navigateMock.mock.calls.at(-1)?.[0];
    expect(navigation.to).toBe("/w/ws-1/assets");
    expect(navigation.hash).toBe("#gallery");
    expect(navigation.replace).toBe(true);
    expect(navigation.mask).toEqual({ to: "/settings/personal/notifications" });
    expect(navigation.search({ assetId: "asset-1" })).toEqual({
      assetId: "asset-1",
      personalSettings: "notifications",
    });
  });

  it("mounts a dedicated internal scroll region for overlay content", () => {
    renderOverlayHost();

    expect(screen.getByTestId("settings-shell-scroll-region")).toHaveClass(
      "min-h-0",
      "flex-1",
      "overflow-y-auto",
    );
  });

  it("closes by going back in history", async () => {
    const user = userEvent.setup();
    renderOverlayHost();

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(historyBackMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("falls back to the root route when there is no history entry to go back to", async () => {
    const user = userEvent.setup();
    window.history.replaceState({ __TSR_index: 0 }, "");
    renderOverlayHost();

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(historyBackMock).not.toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith({ to: "/", replace: true });
  });
});
