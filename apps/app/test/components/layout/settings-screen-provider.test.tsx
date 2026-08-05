import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  SettingsScreenProvider,
  SettingsSectionAnchor,
  useSettingsScreen,
} from "@/components/layout/settings-screen-provider";

const scrollIntoViewMock = vi.fn();

function ProviderHarness() {
  const settings = useSettingsScreen();

  return (
    <div>
      <button type="button" onClick={() => settings.openSettings({ screen: "personal.profile" })}>
        Open profile
      </button>
      <button
        type="button"
        onClick={() =>
          settings.openSettings({ screen: "workspace.general", section: "workspace-icon" })
        }
      >
        Open workspace icon
      </button>
      <button type="button" onClick={() => settings.switchSettingsScreen("workspace.people")}>
        Switch people
      </button>
      <button
        type="button"
        onClick={() =>
          settings.focusSettingsSection({
            screen: "workspace.people",
            section: "member-row",
            payload: { memberId: "member-1" },
          })
        }
      >
        Focus member
      </button>
      <button type="button" onClick={settings.closeSettings}>
        Close settings
      </button>
      <div data-testid="settings-open">{String(settings.state.open)}</div>
      <div data-testid="settings-screen">{settings.state.screen}</div>
      <div data-testid="settings-section">{settings.state.section ?? "none"}</div>
      <div data-testid="settings-member">{settings.state.payload?.memberId ?? "none"}</div>
      <SettingsSectionAnchor section="workspace-icon" data-testid="workspace-icon-anchor">
        Workspace icon
      </SettingsSectionAnchor>
      <SettingsSectionAnchor
        section="member-row"
        payloadMatches={(payload) => payload?.memberId === "member-1"}
        data-testid="member-1-anchor"
      >
        Member 1
      </SettingsSectionAnchor>
      <SettingsSectionAnchor
        section="member-row"
        payloadMatches={(payload) => payload?.memberId === "member-2"}
        data-testid="member-2-anchor"
      >
        Member 2
      </SettingsSectionAnchor>
    </div>
  );
}

function renderHarness() {
  return render(
    <SettingsScreenProvider>
      <ProviderHarness />
    </SettingsScreenProvider>,
  );
}

describe("SettingsScreenProvider", () => {
  it("opens closes and switches settings screens through provider commands", async () => {
    const user = userEvent.setup();
    renderHarness();

    expect(screen.getByTestId("settings-open")).toHaveTextContent("false");
    expect(screen.getByTestId("settings-screen")).toHaveTextContent("personal.profile");

    await user.click(screen.getByRole("button", { name: "Open profile" }));

    expect(screen.getByTestId("settings-open")).toHaveTextContent("true");
    expect(screen.getByTestId("settings-screen")).toHaveTextContent("personal.profile");

    await user.click(screen.getByRole("button", { name: "Switch people" }));

    expect(screen.getByTestId("settings-open")).toHaveTextContent("true");
    expect(screen.getByTestId("settings-screen")).toHaveTextContent("workspace.people");
    expect(screen.getByTestId("settings-section")).toHaveTextContent("none");

    await user.click(screen.getByRole("button", { name: "Close settings" }));

    expect(screen.getByTestId("settings-open")).toHaveTextContent("false");
  });

  it("scrolls focuses and flashes a targeted section", async () => {
    const user = userEvent.setup();
    HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;
    scrollIntoViewMock.mockClear();
    renderHarness();

    await user.click(screen.getByRole("button", { name: "Open workspace icon" }));

    const anchor = screen.getByTestId("workspace-icon-anchor");
    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      block: "center",
      inline: "nearest",
      behavior: "smooth",
    });
    expect(document.activeElement).toBe(anchor);
    expect(anchor).toHaveClass("settings-section-flash");
    expect(screen.getByTestId("settings-screen")).toHaveTextContent("workspace.general");
    expect(screen.getByTestId("settings-section")).toHaveTextContent("workspace-icon");
  });

  it("matches row targets by payload before flashing", async () => {
    const user = userEvent.setup();
    HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;
    scrollIntoViewMock.mockClear();
    renderHarness();

    await user.click(screen.getByRole("button", { name: "Focus member" }));

    const memberOne = screen.getByTestId("member-1-anchor");
    const memberTwo = screen.getByTestId("member-2-anchor");
    expect(screen.getByTestId("settings-screen")).toHaveTextContent("workspace.people");
    expect(screen.getByTestId("settings-member")).toHaveTextContent("member-1");
    expect(memberOne).toHaveClass("settings-section-flash");
    expect(memberTwo).not.toHaveClass("settings-section-flash");
    expect(document.activeElement).toBe(memberOne);
  });

  it("restores focus to the trigger after closing", async () => {
    const user = userEvent.setup();
    renderHarness();

    const trigger = screen.getByRole("button", { name: "Open profile" });
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Close settings" }));

    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
  });
});
