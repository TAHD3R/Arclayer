import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { AccountTopbar } from "@/components/layout/account-topbar";
import { AdminTopbar } from "@/components/layout/admin-topbar";
import { SidebarProvider } from "@arclayer/ui/sidebar";

vi.mock("@arclayer/ui/icons/lucide-animated", () => ({
  Bell: (props: React.ComponentProps<"svg">) => <svg data-testid="animated-bell" {...props} />,
  Menu: (props: React.ComponentProps<"span">) => <span data-testid="animated-menu" {...props} />,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/hooks/use-admin-command-palette", () => ({
  useAdminCommandPalette: () => ({
    sections: [],
    query: "",
    setQuery: vi.fn(),
    emptyText: "empty",
    onSelectEntry: vi.fn(),
  }),
}));

vi.mock("@/components/layout/admin-command-trigger", () => ({
  AdminCommandTrigger: () => <div data-testid="command-trigger" />,
}));

vi.mock("@/components/layout/admin-account-menu", () => ({
  AdminAccountMenu: () => <div data-testid="account-menu" />,
}));

vi.mock("@/components/layout/admin-logo", () => ({
  AdminFullLogo: () => <div data-testid="full-logo" />,
}));

vi.mock("@/components/layout/admin-workspace-switcher", () => ({
  AdminWorkspaceSwitcher: () => <div data-testid="workspace-switcher" />,
}));

function renderWithSidebar(node: React.ReactElement) {
  return render(
    <SidebarProvider defaultOpen className="h-screen">
      {node}
    </SidebarProvider>,
  );
}

function expectAnimatedHamburgerIcon() {
  const toggleButton = screen.getByRole("button", { name: "common:SIDEBAR_TOGGLE" });
  expect(toggleButton.querySelector("[data-testid='animated-menu']")).not.toBeNull();
}

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

describe("topbar sidebar toggle icon", () => {
  it("AdminTopbar 继续使用共享 animated Menu icon", () => {
    renderWithSidebar(
      <AdminTopbar
        navItems={[]}
        commandScope={{
          kind: "none",
          pathname: "/",
          workspaceId: null,
          organizationId: null,
        }}
        notificationOpen={false}
        showNotificationsBadge={false}
        unreadCount={0}
        onNotificationToggle={() => undefined}
      />,
    );

    expectAnimatedHamburgerIcon();
  });

  it("AccountTopbar 继续使用共享 animated Menu icon", () => {
    renderWithSidebar(
      <AccountTopbar
        notificationOpen={false}
        showNotificationsBadge={false}
        unreadCount={0}
        onNotificationToggle={() => undefined}
      />,
    );

    expectAnimatedHamburgerIcon();
  });

  it("AccountTopbar 使用工作区返回入口替代账号设置标题与描述", () => {
    renderWithSidebar(
      <AccountTopbar
        notificationOpen={false}
        showNotificationsBadge={false}
        unreadCount={0}
        onNotificationToggle={() => undefined}
      />,
    );

    expect(screen.getByTestId("workspace-switcher")).toBeInTheDocument();
    expect(screen.queryByText("account:ACCOUNT_SETTINGS_TITLE")).toBeNull();
    expect(screen.queryByText("account:ACCOUNT_SETTINGS_DESC")).toBeNull();
  });
});
