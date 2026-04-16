import { render, screen } from "@testing-library/react";
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
      notificationPanelPinned: false,
      showNotificationsBadge: true,
      reduceMotion: false,
      contrastMore: false,
    });
  });

  it("renders theme as a select row and removes text size and text weight controls", () => {
    render(<UserAppearanceSection />);

    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getAllByRole("switch")).toHaveLength(4);
    expect(screen.queryByText("ME_PREF_TEXT_SIZE_TITLE")).toBeNull();
    expect(screen.queryByText("ME_PREF_TEXT_WEIGHT_TITLE")).toBeNull();
  });
});
