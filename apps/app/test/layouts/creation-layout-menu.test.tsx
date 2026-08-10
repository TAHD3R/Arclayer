import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EditorLogoMenu } from "@/layouts/creation-layout-menu";

const { navigateMock, openSettingsMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  openSettingsMock: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/components/layout/settings-screen-provider", () => ({
  useSettingsScreen: () => ({ openSettings: openSettingsMock }),
}));

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Arclayer" }));
  return screen.findByRole("dialog");
}

describe("EditorLogoMenu", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    openSettingsMock.mockReset();
  });

  it("uses the compact logo trigger and renders the requested floating-panel order", async () => {
    const user = userEvent.setup();
    render(<EditorLogoMenu />);

    const trigger = screen.getByRole("button", { name: "Arclayer" });
    expect(trigger.className).toContain("h-8");
    expect(trigger.querySelector("img")).toHaveStyle({ width: "24px", height: "24px" });
    expect(trigger.querySelector("svg")?.className.baseVal).toContain("transition-transform");

    const dialog = await openMenu(user);
    const labels = within(dialog)
      .getAllByRole("button")
      .map((button) => button.textContent);

    expect(labels).toEqual([
      "CREATION_EDITOR_MENU_DASHBOARD",
      "CREATION_EDITOR_MENU_FILE",
      "CREATION_EDITOR_MENU_EDIT",
      "CREATION_EDITOR_MENU_VIEW",
      "CREATION_EDITOR_MENU_SHARE",
      "CREATION_EDITOR_MENU_PREFERENCES",
      "CREATION_EDITOR_MENU_NOTIFICATIONS",
      "CREATION_EDITOR_MENU_HELP_ACCOUNT",
    ]);
    expect(dialog).not.toHaveTextContent("CREATION_EDITOR_MENU_IMPORT_URL");
    expect(dialog).not.toHaveTextContent("CREATION_EDITOR_MENU_EXPORT");
  });

  it("uses a borderless search field and shows an empty state when nothing matches", async () => {
    const user = userEvent.setup();
    render(<EditorLogoMenu />);

    const dialog = await openMenu(user);
    const search = within(dialog).getByRole("textbox", { name: "CREATION_EDITOR_MENU_SEARCH" });
    expect(search.parentElement?.className).not.toContain("border");

    await user.type(search, "no-match-at-all");

    await waitFor(() => {
      expect(within(dialog).getByText("CREATION_EDITOR_MENU_NO_RESULTS")).toBeVisible();
    });
    expect(within(dialog).queryAllByRole("button")).toHaveLength(0);
  });
});
