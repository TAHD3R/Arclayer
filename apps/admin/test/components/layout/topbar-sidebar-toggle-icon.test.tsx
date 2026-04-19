import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { UserCenterTopbar } from "@/components/layout/usercenter-topbar";
import { AdminTopbar } from "@/components/layout/admin-topbar";
import { SidebarProvider } from "@arclayer/ui/sidebar";
import { TooltipProvider } from "@arclayer/ui/tooltip";
import userEvent from "@testing-library/user-event";

const { fullLogoMock } = vi.hoisted(() => ({
  fullLogoMock: vi.fn((props: { hoverLabel?: string }) => (
    <div data-testid="full-logo" data-hover-label={props.hoverLabel ?? ""} />
  )),
}));

vi.mock("lucide-react", async () => {
  const actual = await vi.importActual<typeof import("lucide-react")>("lucide-react");
  return {
    ...actual,
    Bell: (props: React.ComponentProps<"svg">) => <svg data-testid="bell-icon" {...props} />,
    Menu: (props: React.ComponentProps<"svg">) => <svg data-testid="menu-icon" {...props} />,
  };
});

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
  AdminFullLogo: (props: { hoverLabel?: string }) => fullLogoMock(props),
}));

vi.mock("@/components/layout/admin-workspace-switcher", () => ({
  AdminWorkspaceSwitcher: () => <div data-testid="workspace-switcher" />,
  headerTriggerButtonClassName: "group/panel-trigger hover:bg-accent/60",
}));

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<object>("@tanstack/react-router");
  let pathname = "/";
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useRouterState: ({
      select,
    }: {
      select: (state: { location: { pathname: string } }) => string;
    }) => select({ location: { pathname } }),
    __setPathnameForTest: (nextPathname: string) => {
      pathname = nextPathname;
    },
  };
});

async function setPathname(pathname: string) {
  const routerModule = await import("@tanstack/react-router");
  const setPathnameForTest = (
    routerModule as typeof routerModule & { __setPathnameForTest?: (nextPathname: string) => void }
  ).__setPathnameForTest;
  setPathnameForTest?.(pathname);
}

function renderWithSidebar(node: React.ReactElement) {
  return render(
    <TooltipProvider openDelay={0} closeDelay={0}>
      <SidebarProvider defaultOpen className="h-screen">
        {node}
      </SidebarProvider>
    </TooltipProvider>,
  );
}

function expectStaticHamburgerIcon() {
  const toggleButton = screen.getByRole("button", { name: "common:SIDEBAR_TOGGLE" });
  expect(toggleButton.querySelector("[data-testid='menu-icon']")).not.toBeNull();
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
  beforeEach(async () => {
    fullLogoMock.mockClear();
    await setPathname("/");
  });

  it("AdminTopbar 使用 lucide-react 的静态 Menu icon", () => {
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

    expectStaticHamburgerIcon();
  });

  it("AdminTopbar 在首页不向 logo 注入返回首页 hover 文案", () => {
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

    expect(screen.getByTestId("full-logo")).toHaveAttribute("data-hover-label", "");
  });

  it("AdminTopbar 在 global projects 场景不向 logo 注入返回首页 hover 文案", async () => {
    await setPathname("/projects");

    renderWithSidebar(
      <AdminTopbar
        navItems={[]}
        commandScope={{
          kind: "none",
          pathname: "/projects",
          workspaceId: null,
          organizationId: null,
        }}
        notificationOpen={false}
        showNotificationsBadge={false}
        unreadCount={0}
        onNotificationToggle={() => undefined}
      />,
    );

    expect(screen.getByTestId("full-logo")).toHaveAttribute("data-hover-label", "");
  });

  it("AdminTopbar 在 global system 场景不向 logo 注入返回首页 hover 文案", async () => {
    await setPathname("/system/access");

    renderWithSidebar(
      <AdminTopbar
        navItems={[]}
        commandScope={{
          kind: "none",
          pathname: "/system/access",
          workspaceId: null,
          organizationId: null,
        }}
        notificationOpen={false}
        showNotificationsBadge={false}
        unreadCount={0}
        onNotificationToggle={() => undefined}
      />,
    );

    expect(screen.getByTestId("full-logo")).toHaveAttribute("data-hover-label", "");
  });

  it("AdminTopbar 在非 global nav 场景向 logo 注入返回首页 hover 文案", async () => {
    await setPathname("/notifications");

    renderWithSidebar(
      <AdminTopbar
        navItems={[]}
        commandScope={{
          kind: "workspace",
          pathname: "/notifications",
          workspaceId: "ws-1",
          organizationId: null,
        }}
        notificationOpen={false}
        showNotificationsBadge={false}
        unreadCount={0}
        onNotificationToggle={() => undefined}
      />,
    );

    expect(screen.getByTestId("full-logo")).toHaveAttribute("data-hover-label", "common:GO_HOME");
  });

  it("AdminTopbar 在 workspace 桌面场景可将 sidebar toggle 收敛为仅移动端显示", async () => {
    await setPathname("/projects/ws-1");

    renderWithSidebar(
      <AdminTopbar
        navItems={[]}
        commandScope={{
          kind: "workspace",
          pathname: "/projects/ws-1",
          workspaceId: "ws-1",
          organizationId: null,
        }}
        notificationOpen={false}
        showNotificationsBadge={false}
        unreadCount={0}
        onNotificationToggle={() => undefined}
        sidebarToggleMode="mobile-only"
      />,
    );

    const toggleButton = screen.getByRole("button", { name: "common:SIDEBAR_TOGGLE" });
    expect(toggleButton.className).toContain("md:hidden");
  });

  it("AdminTopbar 在常驻 sidebar toggle 模式下使用 collapsed sidebar 宽度", async () => {
    await setPathname("/projects/ws-1");

    renderWithSidebar(
      <AdminTopbar
        navItems={[]}
        commandScope={{
          kind: "workspace",
          pathname: "/projects/ws-1",
          workspaceId: "ws-1",
          organizationId: null,
        }}
        notificationOpen={false}
        showNotificationsBadge={false}
        unreadCount={0}
        onNotificationToggle={() => undefined}
        sidebarToggleMode="always"
      />,
    );

    const toggleButton = screen.getByRole("button", { name: "common:SIDEBAR_TOGGLE" });
    expect(toggleButton).toHaveAttribute("data-variant", "ghost");
    expect(toggleButton).toHaveAttribute("data-size", "icon-lg");
    expect(Array.from(toggleButton.classList)).not.toContain("border-r");
    expect(toggleButton.className).not.toContain("md:hidden");
    expect(toggleButton.closest(".grid")).toHaveClass("p-2");
  });

  it("AdminTopbar 将 command trigger 宽度收窄", async () => {
    await setPathname("/projects/ws-1");

    renderWithSidebar(
      <AdminTopbar
        navItems={[]}
        commandScope={{
          kind: "workspace",
          pathname: "/projects/ws-1",
          workspaceId: "ws-1",
          organizationId: null,
        }}
        notificationOpen={false}
        showNotificationsBadge={false}
        unreadCount={0}
        onNotificationToggle={() => undefined}
      />,
    );

    const commandShell = screen.getByTestId("command-trigger").parentElement;
    expect(commandShell).toHaveClass("max-w-[24rem]");
  });

  it("UserCenterTopbar 使用 lucide-react 的静态 Menu icon", () => {
    renderWithSidebar(
      <UserCenterTopbar
        notificationOpen={false}
        showNotificationsBadge={false}
        unreadCount={0}
        onNotificationToggle={() => undefined}
      />,
    );

    expectStaticHamburgerIcon();
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

  it("AdminTopbar 的通知按钮在 hover 时显示 tooltip", async () => {
    const user = userEvent.setup();

    renderWithSidebar(
      <AdminTopbar
        navItems={[]}
        commandScope={{
          kind: "none",
          pathname: "/projects",
          workspaceId: null,
          organizationId: null,
        }}
        notificationOpen={false}
        showNotificationsBadge={false}
        unreadCount={0}
        onNotificationToggle={() => undefined}
      />,
    );

    const trigger = screen.getByRole("button", {
      name: "notifications:NOTIFICATIONS_OPEN_CENTER",
    });

    await user.hover(trigger);

    await waitFor(() => {
      expect(document.body.querySelector('[data-slot="tooltip-content"]')).toHaveTextContent(
        "notifications:NOTIFICATIONS_OPEN_CENTER",
      );
    });
  });

  it("AdminTopbar 在通知按钮右侧渲染 Help Center 占位按钮", () => {
    renderWithSidebar(
      <AdminTopbar
        navItems={[]}
        commandScope={{
          kind: "none",
          pathname: "/projects",
          workspaceId: null,
          organizationId: null,
        }}
        notificationOpen={false}
        showNotificationsBadge={false}
        unreadCount={0}
        onNotificationToggle={() => undefined}
      />,
    );

    const trailing = screen.getByTestId("account-menu").parentElement;
    expect(trailing).not.toBeNull();
    if (!trailing) throw new Error("Missing topbar trailing container");

    const actionButtons = within(trailing).getAllByRole("button");
    expect(actionButtons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "notifications:NOTIFICATIONS_OPEN_CENTER",
      "account:ACCOUNT_HELP_CENTER",
    ]);
  });
});
