import { render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { UserCenterTopbar } from "@/components/layout/usercenter-topbar";
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
  headerTriggerButtonClassName: "group/panel-trigger hover:bg-accent/60",
}));

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<object>("@tanstack/react-router");
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

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

  it("UserCenterTopbar 继续使用共享 animated Menu icon", () => {
    renderWithSidebar(
      <UserCenterTopbar
        notificationOpen={false}
        showNotificationsBadge={false}
        unreadCount={0}
        onNotificationToggle={() => undefined}
      />,
    );

    expectAnimatedHamburgerIcon();
  });

  it("UserCenterTopbar 在桌面场景不再用隐藏 toggle 占位，而是直接按导航内容线对齐 logo", () => {
    renderWithSidebar(
      <UserCenterTopbar
        notificationOpen={false}
        showNotificationsBadge={false}
        unreadCount={0}
        onNotificationToggle={() => undefined}
      />,
    );

    const toggleButton = screen.getByRole("button", { name: "common:SIDEBAR_TOGGLE" });
    expect(toggleButton.className).toContain("md:hidden");
    expect(toggleButton.className).not.toContain("md:invisible");

    const logo = screen.getByTestId("full-logo");
    const leading = logo.parentElement?.parentElement;
    expect(leading).toHaveClass("md:pl-3");
  });

  it("UserCenterTopbar 使用工作区返回入口替代账号设置标题与描述", () => {
    renderWithSidebar(
      <UserCenterTopbar
        backLabel="Back to source"
        notificationOpen={false}
        showNotificationsBadge={false}
        unreadCount={0}
        onNotificationToggle={() => undefined}
      />,
    );

    const backButton = screen.getByRole("button", { name: "Back to source" });
    expect(backButton).toBeInTheDocument();
    expect(backButton.className).toContain("group/panel-trigger");
    expect(backButton.className).toContain("hover:bg-accent/60");
    expect(screen.queryByTestId("workspace-switcher")).toBeNull();
    expect(screen.queryByText("account:ACCOUNT_SETTINGS_TITLE")).toBeNull();
    expect(screen.queryByText("account:ACCOUNT_SETTINGS_DESC")).toBeNull();
  });

  it("UserCenterTopbar 默认不显示 command trigger", () => {
    renderWithSidebar(
      <UserCenterTopbar
        notificationOpen={false}
        showNotificationsBadge={false}
        unreadCount={0}
        onNotificationToggle={() => undefined}
      />,
    );

    expect(screen.getByTestId("full-logo")).toBeInTheDocument();
    expect(screen.queryByTestId("command-trigger")).toBeNull();
  });

  it("UserCenterTopbar 可在 notifications 场景显示中间 command trigger", async () => {
    renderWithSidebar(
      <UserCenterTopbar
        navItems={[]}
        showCommandTrigger
        notificationOpen={false}
        showNotificationsBadge={false}
        unreadCount={0}
        onNotificationToggle={() => undefined}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("command-trigger")).toBeInTheDocument();
    });
  });
});
