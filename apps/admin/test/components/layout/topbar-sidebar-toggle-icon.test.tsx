import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { UserCenterTopbar } from "@/components/layout/usercenter-topbar";
import { AdminTopbar } from "@/components/layout/admin-topbar";
import { SidebarProvider } from "@arclayer/ui/sidebar";
import { TooltipProvider } from "@arclayer/ui/tooltip";
import userEvent from "@testing-library/user-event";

vi.mock("lucide-react", async () => {
  const actual = await vi.importActual<typeof import("lucide-react")>("lucide-react");
  return {
    ...actual,
    Bell: (props: React.ComponentProps<"svg">) => <svg data-testid="bell-icon" {...props} />,
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/components/layout/admin-account-menu", () => ({
  AdminAccountMenu: () => <div data-testid="account-menu" />,
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
    await setPathname("/");
  });

  it("AdminTopbar 默认只保留右侧操作区", () => {
    renderWithSidebar(
      <AdminTopbar
        notificationOpen={false}
        showNotificationsBadge={false}
        unreadCount={0}
        onNotificationToggle={() => undefined}
      />,
    );

    expect(screen.queryByTestId("workspace-switcher")).toBeNull();
    expect(screen.queryByRole("button", { name: "common:SIDEBAR_TOGGLE" })).toBeNull();
    expect(screen.getByTestId("account-menu")).toBeInTheDocument();
  });

  it("AdminTopbar 不再在 topbar 中间渲染 command trigger", async () => {
    await setPathname("/projects/ws-1");

    renderWithSidebar(
      <AdminTopbar
        notificationOpen={false}
        showNotificationsBadge={false}
        unreadCount={0}
        onNotificationToggle={() => undefined}
      />,
    );

    expect(screen.queryByTestId("command-trigger")).toBeNull();
  });

  it("UserCenterTopbar 同样移除 topbar 折叠按钮", () => {
    renderWithSidebar(
      <UserCenterTopbar
        notificationOpen={false}
        showNotificationsBadge={false}
        unreadCount={0}
        onNotificationToggle={() => undefined}
      />,
    );

    expect(screen.queryByRole("button", { name: "common:SIDEBAR_TOGGLE" })).toBeNull();
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

    expect(screen.getByTestId("account-menu")).toBeInTheDocument();
  });

  it("UserCenterTopbar 维持顶部精简结构，只显示返回入口和右侧操作区", () => {
    renderWithSidebar(
      <UserCenterTopbar
        notificationOpen={false}
        showNotificationsBadge={false}
        unreadCount={0}
        onNotificationToggle={() => undefined}
      />,
    );

    expect(screen.queryByText("command-trigger")).toBeNull();
    expect(screen.getByTestId("account-menu")).toBeInTheDocument();
  });

  it("AdminTopbar 的通知按钮在 hover 时显示 tooltip", async () => {
    const user = userEvent.setup();

    renderWithSidebar(
      <AdminTopbar
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

  it("AdminTopbar 将 workspace switcher 保持在左侧，trailing 只保留通知与账号菜单", () => {
    renderWithSidebar(
      <AdminTopbar
        notificationOpen={false}
        showNotificationsBadge={false}
        unreadCount={0}
        onNotificationToggle={() => undefined}
      />,
    );

    const trailing = screen.getByTestId("account-menu").parentElement;
    expect(trailing).not.toBeNull();
    if (!trailing) throw new Error("Missing topbar trailing container");

    const children = Array.from(trailing.children);
    expect(children.map((child) => child.getAttribute("data-testid"))).toEqual([
      null,
      "account-menu",
    ]);
    expect(children[0]).toHaveAttribute("aria-label", "notifications:NOTIFICATIONS_OPEN_CENTER");
    expect(
      within(trailing.parentElement as HTMLElement).queryByTestId("workspace-switcher"),
    ).toBeNull();
  });
});
