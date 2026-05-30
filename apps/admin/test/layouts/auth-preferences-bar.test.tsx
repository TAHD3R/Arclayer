import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthPreferencesBar } from "@/layouts/auth-preferences-bar";
import { usePreferencesStore } from "@/stores/use-preference-store";
import { setThemePreferenceWithTransition } from "@/components/ui/theme-transition";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { t: (key: string) => key },
  }),
}));

vi.mock("@/components/ui/theme-transition", () => ({
  setThemePreferenceWithTransition: vi.fn().mockResolvedValue(undefined),
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

describe("AuthPreferencesBar", () => {
  beforeEach(() => {
    vi.mocked(setThemePreferenceWithTransition).mockClear();
    usePreferencesStore.setState({
      locale: "zh-CN",
      localePreference: "zh-CN",
      localePreferenceMode: "explicit",
      themeMode: "light",
      themePreference: "light",
    });
  });

  it("renders as a full-width footer without visible labels or card chrome", () => {
    render(<AuthPreferencesBar />);

    const bar = screen.getByTestId("auth-preferences-bar");
    const content = bar.firstElementChild as HTMLElement;

    expect(bar).toHaveClass("shrink-0", "bg-background");
    expect(bar).not.toHaveClass("fixed", "inset-x-0", "bottom-0", "border-t");
    expect(content).not.toHaveClass("rounded-md", "border", "shadow-sm", "backdrop-blur");
    expect(screen.queryByText("auth:AUTH_LANGUAGE_LABEL")).not.toBeInTheDocument();
    expect(screen.queryByText("auth:AUTH_THEME_LABEL")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "ACCOUNT_SETTINGS_LANGUAGE_LABEL" })).toHaveClass(
      "!text-callout",
    );
    expect(screen.getByRole("combobox", { name: "ACCOUNT_SETTINGS_THEME_LABEL" })).toHaveClass(
      "!text-callout",
    );
    expect(
      screen.getByRole("combobox", { name: "ACCOUNT_SETTINGS_THEME_LABEL" }).querySelector("svg"),
    ).toBeInTheDocument();
  });

  it("uses auth language options and writes through the preference store", async () => {
    const user = userEvent.setup();

    render(<AuthPreferencesBar />);

    await user.click(screen.getByRole("combobox", { name: "ACCOUNT_SETTINGS_LANGUAGE_LABEL" }));

    expect(
      await screen.findByRole("option", { name: "ACCOUNT_LANGUAGE_SYSTEM_DEFAULT" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "ME_PREF_LOCALE_MODE_WORKSPACE" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "ACCOUNT_LANGUAGE_SYSTEM_DEFAULT" }).querySelector("svg"),
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "account:ACCOUNT_LANGUAGE_ZH" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "account:ACCOUNT_LANGUAGE_EN" })).toBeInTheDocument();

    await user.click(screen.getByRole("option", { name: "ACCOUNT_LANGUAGE_SYSTEM_DEFAULT" }));
    expect(usePreferencesStore.getState().localePreferenceMode).toBe("browser");

    await user.click(screen.getByRole("combobox", { name: "ACCOUNT_SETTINGS_LANGUAGE_LABEL" }));
    await user.click(await screen.findByRole("option", { name: "account:ACCOUNT_LANGUAGE_EN" }));

    await waitFor(() => {
      expect(usePreferencesStore.getState().locale).toBe("en-US");
      expect(usePreferencesStore.getState().localePreferenceMode).toBe("explicit");
    });
  });

  it("shows system default on login when the stored language mode is workspace", () => {
    usePreferencesStore.setState({
      localePreference: null,
      localePreferenceMode: "workspace",
    });

    render(<AuthPreferencesBar />);

    expect(screen.getByText("ACCOUNT_LANGUAGE_SYSTEM_DEFAULT")).toBeInTheDocument();
    expect(screen.queryByText("ME_PREF_LOCALE_MODE_WORKSPACE")).not.toBeInTheDocument();
  });

  it("uses the personal preference theme options with icons", async () => {
    const user = userEvent.setup();

    render(<AuthPreferencesBar />);

    await user.click(screen.getByRole("combobox", { name: "ACCOUNT_SETTINGS_THEME_LABEL" }));

    const systemOption = await screen.findByRole("option", { name: "ACCOUNT_THEME_SYSTEM" });
    const lightOption = screen.getByRole("option", { name: "ACCOUNT_THEME_LIGHT" });
    const darkOption = screen.getByRole("option", { name: "ACCOUNT_THEME_DARK" });

    expect(systemOption.querySelector("svg")).toBeInTheDocument();
    expect(lightOption.querySelector("svg")).toBeInTheDocument();
    expect(darkOption.querySelector("svg")).toBeInTheDocument();

    await user.click(darkOption);

    expect(setThemePreferenceWithTransition).toHaveBeenCalledWith("dark", { direction: "ltr" });
  });
});
