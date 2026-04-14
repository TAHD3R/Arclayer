import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UsercenterOverlayHost } from "@/components/layout/usercenter-overlay-host";
import { ChromeTabsProvider } from "@arclayer/ui/chrome-tabs";

const navigateMock = vi.fn().mockResolvedValue(undefined);
const historyBackMock = vi.fn();

const overlaySearch: { usercenter?: string } = { usercenter: "profile" };
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

vi.mock("@/pages/usercenter/security/components/user-security-view", () => ({
  UserSecurityView: () => <div data-testid="overlay-security-view">security</div>,
}));

vi.mock("@/pages/usercenter/notifications/components/user-notification-settings-view", () => ({
  UserNotificationSettingsView: () => (
    <div data-testid="overlay-notifications-view">notifications</div>
  ),
}));

vi.mock("@/pages/usercenter/billing/page", () => ({
  UserCenterBillingContent: () => <div data-testid="overlay-billing-view">billing</div>,
}));

vi.mock("@/pages/usercenter/usage/page", () => ({
  UserCenterUsageContent: () => <div data-testid="overlay-usage-view">usage</div>,
}));

vi.mock("@/pages/usercenter/danger/page", () => ({
  UserCenterDangerContent: () => <div data-testid="overlay-danger-view">danger</div>,
}));

function renderOverlayHost() {
  return render(
    <ChromeTabsProvider
      labels={{ scrollLeftAriaLabel: "scroll left", scrollRightAriaLabel: "scroll right" }}
    >
      <UsercenterOverlayHost />
    </ChromeTabsProvider>,
  );
}

describe("UsercenterOverlayHost", () => {
  beforeEach(() => {
    navigateMock.mockClear();
    historyBackMock.mockClear();
    overlaySearch.usercenter = "profile";
    routerState.pathname = "/w/ws-1/assets";
    routerState.hash = "#gallery";
    window.history.replaceState({ __TSR_index: 1 }, "");
  });

  it("renders the active overlay tab content inside expandable screen chrome", () => {
    renderOverlayHost();

    expect(screen.getByText("account:ME_TAB_PROFILE")).toBeVisible();
    expect(screen.getByTestId("overlay-profile-view")).toBeVisible();
  });

  it("switches tabs by masked navigation while keeping the current background route", async () => {
    const user = userEvent.setup();
    renderOverlayHost();

    await user.click(screen.getByRole("tab", { name: "account:ACCOUNT_NAV_NOTIFICATIONS" }));

    const navigation = navigateMock.mock.calls.at(-1)?.[0];
    expect(navigation.to).toBe("/w/ws-1/assets");
    expect(navigation.hash).toBe("#gallery");
    expect(navigation.replace).toBe(true);
    expect(navigation.mask).toEqual({ to: "/usercenter/notifications" });
    expect(navigation.search({ assetId: "asset-1" })).toEqual({
      assetId: "asset-1",
      usercenter: "notifications",
    });
  });

  it("mounts a dedicated internal scroll region for overlay content", () => {
    renderOverlayHost();

    expect(screen.getByTestId("usercenter-overlay-scroll-region")).toHaveClass(
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
