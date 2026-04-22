import { render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { UserCenterTopbar } from "@/components/layout/usercenter-topbar";
import { AdminTopbar } from "@/components/layout/admin-topbar";
import { SidebarProvider } from "@arclayer/ui/sidebar";

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
    <SidebarProvider defaultOpen className="h-screen">
      {node}
    </SidebarProvider>,
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
    renderWithSidebar(<AdminTopbar />);

    expect(screen.queryByTestId("workspace-switcher")).toBeNull();
    expect(screen.queryByRole("button", { name: "common:SIDEBAR_TOGGLE" })).toBeNull();
    expect(screen.getByTestId("account-menu")).toBeInTheDocument();
  });

  it("AdminTopbar 不再在 topbar 中间渲染 command trigger", async () => {
    await setPathname("/projects/ws-1");

    renderWithSidebar(<AdminTopbar />);

    expect(screen.queryByTestId("command-trigger")).toBeNull();
  });

  it("UserCenterTopbar 同样移除 topbar 折叠按钮", () => {
    renderWithSidebar(<UserCenterTopbar />);

    expect(screen.queryByRole("button", { name: "common:SIDEBAR_TOGGLE" })).toBeNull();
  });

  it("UserCenterTopbar 使用工作区返回入口替代账号设置标题与描述", () => {
    renderWithSidebar(<UserCenterTopbar backLabel="Back to source" />);

    const backButton = screen.getByRole("button", { name: "Back to source" });
    expect(backButton).toBeInTheDocument();
    expect(backButton.className).toContain("group/panel-trigger");
    expect(backButton.className).toContain("hover:bg-accent/60");
    expect(screen.queryByTestId("workspace-switcher")).toBeNull();
    expect(screen.queryByText("account:ACCOUNT_SETTINGS_TITLE")).toBeNull();
    expect(screen.queryByText("account:ACCOUNT_SETTINGS_DESC")).toBeNull();
  });

  it("UserCenterTopbar 默认不显示 command trigger", () => {
    renderWithSidebar(<UserCenterTopbar />);

    expect(screen.getByTestId("account-menu")).toBeInTheDocument();
  });

  it("UserCenterTopbar 维持顶部精简结构，只显示返回入口和右侧操作区", () => {
    renderWithSidebar(<UserCenterTopbar />);

    expect(screen.queryByText("command-trigger")).toBeNull();
    expect(screen.getByTestId("account-menu")).toBeInTheDocument();
  });

  it("AdminTopbar 将右侧操作区收束为账号菜单", () => {
    renderWithSidebar(<AdminTopbar />);

    const trailing = screen.getByTestId("account-menu").parentElement;
    expect(trailing).not.toBeNull();
    if (!trailing) throw new Error("Missing topbar trailing container");

    const children = Array.from(trailing.children);
    expect(children.map((child) => child.getAttribute("data-testid"))).toEqual(["account-menu"]);
  });
});
