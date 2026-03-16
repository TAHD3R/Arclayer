import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MePreferencesLocalizationSection } from "@/pages/me/preferences/components/preferences-localization-section";
import { usePreferencesStore } from "@/stores/use-preference-store";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/lib/i18n", async () => {
  const actual = await vi.importActual<typeof import("@/lib/i18n")>("@/lib/i18n");

  return {
    ...actual,
    i18n: {
      changeLanguage: vi.fn().mockResolvedValue(undefined),
    },
  };
});

describe("MePreferencesLocalizationSection", () => {
  beforeEach(() => {
    usePreferencesStore.setState({
      locale: "zh-CN",
      localePreference: null,
      localePreferenceMode: "workspace",
      timeZonePreference: "Asia/Shanghai",
    });
  });

  it("renders browser-language and auto-timezone switches", () => {
    render(<MePreferencesLocalizationSection />);

    expect(screen.getAllByRole("switch")).toHaveLength(2);
  });

  it("disables manual selects when automatic switches are enabled", async () => {
    const user = userEvent.setup();

    render(<MePreferencesLocalizationSection />);

    const [timezoneSwitch, languageSwitch] = screen.getAllByRole("switch");
    const [timezoneSelect, languageSelect] = screen.getAllByRole("combobox");

    await user.click(timezoneSwitch);
    await user.click(languageSwitch);

    expect(timezoneSelect).toBeDisabled();
    expect(languageSelect).toBeDisabled();
  });

  it("mounts select dropdown to dialog overlay root inside modal overlays", async () => {
    const user = userEvent.setup();
    const overlayRoot = document.createElement("div");
    const dialogContent = document.createElement("div");

    overlayRoot.setAttribute("data-overlay-root", "dialog");
    dialogContent.setAttribute("data-slot", "dialog-content");
    overlayRoot.appendChild(dialogContent);
    document.body.appendChild(overlayRoot);

    try {
      render(<MePreferencesLocalizationSection />, { container: dialogContent });

      const [timezoneSelect] = screen.getAllByRole("combobox");
      await user.click(timezoneSelect);

      await waitFor(() => {
        const dropdown = document.querySelector("[data-slot='select-content']");
        expect(dropdown).not.toBeNull();
        expect(overlayRoot.contains(dropdown)).toBe(true);
      });
    } finally {
      overlayRoot.remove();
    }
  });
});
