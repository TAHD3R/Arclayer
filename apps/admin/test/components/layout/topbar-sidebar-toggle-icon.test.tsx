import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImageIcon } from "lucide-react";
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

vi.mock("@/components/layout/admin-scope-switcher", () => ({
  AdminScopeSwitcher: () => <div data-testid="workspace-switcher" />,
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
    expect(screen.getByRole("navigation", { name: "common:BREADCRUMB_LABEL" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "nav:NAV_HOME" })).toBeInTheDocument();
    const feedbackButton = screen.getByRole("button", { name: "common:TOPBAR_FEEDBACK" });
    const askAiButton = screen.getByRole("button", { name: "common:TOPBAR_ASK_AI" });
    expect(feedbackButton).toHaveAttribute("data-variant", "outline");
    expect(feedbackButton).toHaveAttribute("data-size", "sm");
    expect(askAiButton).toHaveAttribute("data-variant", "outline");
    expect(askAiButton).toHaveAttribute("data-size", "sm");
    expect(screen.getByTestId("account-menu")).toBeInTheDocument();
  });

  it("AdminTopbar 在项目范围显示项目名称与真实导航 breadcrumb", async () => {
    const user = userEvent.setup();
    const handleProjectSelect = vi.fn();
    const handleNavigate = vi.fn();
    const handleAllProjectsSelect = vi.fn();
    const handleHomeSelect = vi.fn();

    renderWithSidebar(
      <AdminTopbar
        project={{
          projectId: "project-alpha",
          name: "Project Alpha",
          iconMode: "glyph",
          iconColor: "#2563eb",
          iconGlyph: "rocket",
          iconEmoji: null,
          iconUrl: null,
        }}
        projectMenu={{
          projects: [
            {
              projectId: "project-alpha",
              workspaceId: "workspace-alpha",
              name: "Project Alpha",
              description: "Primary project",
              enterable: true,
              iconMode: "glyph",
              iconColor: "#2563eb",
              iconGlyph: "rocket",
              iconEmoji: null,
              iconUrl: null,
            },
            {
              projectId: "project-beta",
              workspaceId: "workspace-alpha",
              name: "Project Beta",
              description: null,
              enterable: true,
              iconMode: "initials",
              iconColor: "#16a34a",
              iconGlyph: null,
              iconEmoji: null,
              iconUrl: null,
            },
          ],
          activeProjectId: "project-alpha",
          onProjectSelect: handleProjectSelect,
          onAllProjectsSelect: handleAllProjectsSelect,
          onHomeSelect: handleHomeSelect,
        }}
        breadcrumbs={[
          {
            key: "section:nav:NAV_GROUP_WEBSITE",
            label: "Website",
            labelKey: "nav:NAV_GROUP_WEBSITE",
            menuItems: [
              {
                key: "assets",
                label: "Assets",
                labelKey: "nav:NAV_ASSETS",
                to: "/projects/project-alpha/assets",
                isCurrent: true,
                icon: ImageIcon,
              },
              {
                key: "content.library",
                label: "Content",
                labelKey: "nav:NAV_CONTENT_LIBRARY",
                to: "/projects/project-alpha/content/library",
              },
            ],
          },
          {
            key: "assets",
            label: "Assets",
            labelKey: "nav:NAV_ASSETS",
            to: "/projects/project-alpha/assets",
            isCurrent: true,
          },
        ]}
        onNavigate={handleNavigate}
      />,
    );

    const projectButton = screen.getByRole("button", { name: "Project Alpha" });
    expect(projectButton).toBeInTheDocument();
    expect(projectButton).toHaveAttribute("data-size", "sm");
    expect(projectButton.querySelector("svg,img")).toBeNull();
    const websiteButton = screen.getByRole("button", { name: "nav:NAV_GROUP_WEBSITE" });
    const assetsButton = screen.getByRole("button", { name: "nav:NAV_ASSETS" });
    expect(websiteButton).toHaveAttribute("data-size", "sm");
    expect(assetsButton).toHaveAttribute("data-size", "sm");
    expect(websiteButton.querySelector("svg,img")).toBeNull();
    expect(assetsButton.querySelector("svg,img")).toBeNull();

    await user.click(projectButton);
    await user.click(await screen.findByRole("menuitem", { name: /Project Beta/ }));
    expect(handleProjectSelect).toHaveBeenCalledWith("project-beta");

    await user.click(projectButton);
    await user.click(await screen.findByRole("menuitem", { name: "nav:NAV_ALL_PROJECTS" }));
    expect(handleAllProjectsSelect).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "nav:NAV_GROUP_WEBSITE" }));
    const currentAssetsItem = await screen.findByRole("menuitem", { name: "nav:NAV_ASSETS" });
    expect(currentAssetsItem.className).toContain("bg-accent");
    expect(currentAssetsItem.className).toContain("text-footnote");
    expect(currentAssetsItem.className).not.toContain("bg-accent text-accent-foreground");
    expect(currentAssetsItem.className).not.toContain("text-callout");
    expect(currentAssetsItem.querySelector("svg")).not.toBeNull();
    await user.click(await screen.findByRole("menuitem", { name: "nav:NAV_CONTENT_LIBRARY" }));
    expect(handleNavigate).toHaveBeenCalledWith("/projects/project-alpha/content/library");
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

  it("AdminTopbar 将右侧操作区排列为反馈、AI 与账号菜单", () => {
    renderWithSidebar(<AdminTopbar />);

    const trailing = screen.getByTestId("account-menu").parentElement;
    expect(trailing).not.toBeNull();
    if (!trailing) throw new Error("Missing topbar trailing container");

    const children = Array.from(trailing.children);
    expect(children.map((child) => child.textContent || child.getAttribute("data-testid"))).toEqual(
      ["common:TOPBAR_FEEDBACK", "common:TOPBAR_ASK_AI", "account-menu"],
    );
  });
});
