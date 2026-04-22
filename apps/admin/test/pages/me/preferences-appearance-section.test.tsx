import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UserAppearanceSection } from "@/pages/usercenter/appearance/components/preferences-appearance-section";
import { usePreferencesStore } from "@/stores/use-preference-store";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("UserAppearanceSection", () => {
  beforeEach(() => {
    usePreferencesStore.setState({
      themePreference: "light",
      showNotificationsBadge: true,
      reduceMotion: false,
      contrastMore: false,
      sidebarItemVisibility: { favorites: true },
    });
  });

  it("renders theme as a select row and removes text size and text weight controls", () => {
    render(<UserAppearanceSection />);

    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getAllByRole("switch")).toHaveLength(3);
    expect(screen.queryByText("ME_PREF_SIDEBAR_NAVIGATION_TITLE")).toBeNull();
    expect(screen.queryByText("ME_PREF_SIDEBAR_FAVORITES_TITLE")).toBeNull();
    expect(screen.queryByText("ME_PREF_TEXT_SIZE_TITLE")).toBeNull();
    expect(screen.queryByText("ME_PREF_TEXT_WEIGHT_TITLE")).toBeNull();
  });

  it("keeps favorites visible by default in sidebar item visibility preferences", () => {
    expect(usePreferencesStore.getState().sidebarItemVisibility.favorites).toBe(true);
  });

  it("toggles favorites sidebar visibility through the preferences switch", async () => {
    const user = userEvent.setup();
    const { UserSidebarNavigationSection } =
      await import("@/pages/usercenter/appearance/components/preferences-appearance-section");
    render(<UserSidebarNavigationSection />);

    const favoritesSwitch = screen.getByRole("switch");

    expect(usePreferencesStore.getState().sidebarItemVisibility.favorites).toBe(true);

    await user.click(favoritesSwitch);

    expect(usePreferencesStore.getState().sidebarItemVisibility.favorites).toBe(false);
  });
});
