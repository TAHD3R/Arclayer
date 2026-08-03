import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { OVERVIEW_DESTINATION, PLATFORM_CAPABILITY_MODULES } from "@/capabilities/module-registry";
import { PlatformCommandCenter } from "@/command-center/platform-command-center";
import { initializePlatformI18n, i18n } from "@/lib/i18n";

const tenantDestination = PLATFORM_CAPABILITY_MODULES["tenants.workspaces"].destinations[0];
const destinations = [OVERVIEW_DESTINATION, tenantDestination];

beforeAll(async () => {
  await initializePlatformI18n("en-US");
});

beforeEach(async () => {
  window.sessionStorage.clear();
  await i18n.changeLanguage("en-US");
});

describe("Platform Command Center", () => {
  it("opens from the keyboard and navigates only to a typed authorized destination", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(
      <PlatformCommandCenter
        destinations={destinations}
        isCatalogPartial={false}
        onNavigate={onNavigate}
        pathname="/"
      />,
    );

    await user.keyboard("{Meta>}k{/Meta}");
    const dialog = await screen.findByRole("dialog", { name: "Go to a page" });
    await waitFor(() => expect(dialog).toBeVisible());
    await user.click(screen.getByText("Workspaces"));

    expect(onNavigate).toHaveBeenCalledWith("/workspaces");
  });

  it("reports partial build coverage without inventing unavailable results", async () => {
    const user = userEvent.setup();
    render(
      <PlatformCommandCenter
        destinations={[OVERVIEW_DESTINATION]}
        isCatalogPartial
        onNavigate={vi.fn()}
        pathname="/"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Open navigation" }));

    const dialog = await screen.findByRole("dialog", { name: "Go to a page" });
    await waitFor(() => expect(dialog).toBeVisible());
    expect(
      screen.getByText("Some pages you can use are not available in this Console release."),
    ).toBeVisible();
    expect(screen.queryByText("Workspaces")).not.toBeInTheDocument();
  });
});
