import * as React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FileText, House } from "lucide-react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminSidebarShell } from "@/components/layout/admin-sidebar-shell";
import type { AdminNavItem } from "@/types/admin-nav";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuIconItem,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";
import { SidebarProvider } from "@arclayer/ui/sidebar";

const { navClickSpy, navigateMock } = vi.hoisted(() => ({
  navClickSpy: vi.fn(),
  navigateMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
}));

vi.mock("@/components/layout/admin-side-nav", () => ({
  AdminSiderNav: () => (
    <button type="button" data-testid="admin-sider-nav" onClick={() => navClickSpy()}>
      Nav item
    </button>
  ),
}));

vi.mock("@/components/layout/admin-sidebar-skeleton", () => ({
  AdminSidebarMainMenuSkeleton: () => <div data-testid="admin-sidebar-main-skeleton" />,
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
  AdminCommandTrigger: (props: { variant?: "pill" | "icon"; className?: string }) => (
    <div
      data-testid={props.variant === "icon" ? "sidebar-command-trigger" : "command-trigger"}
      className={props.className}
    />
  ),
}));

vi.mock("@/components/layout/admin-logo", () => ({
  AdminFullLogo: (props: { width: number }) => (
    <div data-testid="sidebar-brand-logo" data-width={props.width} />
  ),
  AdminLogo: (props: { size: number }) => (
    <div data-testid="sidebar-brand-icon-logo" data-size={props.size} />
  ),
}));

vi.mock("@/components/layout/admin-scope-switcher", () => ({
  AdminScopeSwitcher: (props: { variant?: "sidebar" | "header" }) => (
    <div data-testid="sidebar-workspace-switcher" data-variant={props.variant} />
  ),
}));

vi.mock("@/components/layout/admin-sidebar-inbox", () => ({
  AdminSidebarInbox: () => <div data-testid="sidebar-inbox-content">Inbox content</div>,
}));
vi.mock("@/components/ai/agent-thread-sidebar", () => ({
  AgentThreadSidebar: () => <div data-testid="agent-thread-sidebar">Agent Threads</div>,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "zh-CN" },
    t: (key: string) => {
      if (key === "common:SIDEBAR_TOGGLE") return "Toggle sidebar";
      if (key === "common:SIDEBAR_RESIZE") return "Toggle sidebar";
      if (key === "nav:NAV_INBOX") return "Inbox";
      return key;
    },
  }),
}));

function renderWithSidebar(node: React.ReactElement) {
  return render(
    <SidebarProvider defaultOpen className="h-screen">
      {node}
    </SidebarProvider>,
  );
}

function TestLayoutMenu() {
  const [open, setOpen] = React.useState(false);

  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Open layout menu
      </button>
      <button type="button" onClick={() => setOpen(false)}>
        Close layout menu
      </button>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button type="button">Layout menu trigger</button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuIconItem onSelect={() => setOpen(false)}>Menu action</DropdownMenuIconItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

describe("AdminSidebarShell", () => {
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

    class ResizeObserverMock {
      observe() {
        return undefined;
      }
      unobserve() {
        return undefined;
      }
      disconnect() {
        return undefined;
      }
    }

    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  });

  beforeEach(() => {
    navClickSpy.mockClear();
    navigateMock.mockClear();
  });

  it("does not show a tooltip when hovering the shared sidebar rail", async () => {
    const { container } = renderWithSidebar(
      <AdminSidebarShell
        showNavSkeleton={false}
        showOrgNavErrorOverlay={false}
        mainItems={[]}
        collapsible="icon"
      />,
    );

    const rail = container.querySelector<HTMLButtonElement>('[data-sidebar="rail"]');
    expect(rail).not.toBeNull();
    if (!rail) throw new Error("Missing sidebar rail");
    fireEvent.mouseEnter(rail, { clientX: 80, clientY: 120 });
    fireEvent.mouseMove(rail, { clientX: 96, clientY: 144 });

    await waitFor(() => {
      expect(document.body.querySelector('[data-slot="sidebar-rail-tooltip"]')).toBeNull();
    });
  });

  it("renders the shared sidebar rail when the desktop sidebar is collapsible", () => {
    const { container } = renderWithSidebar(
      <AdminSidebarShell
        showNavSkeleton={false}
        showOrgNavErrorOverlay={false}
        mainItems={[]}
        collapsible="icon"
      />,
    );

    const rail = document.querySelector<HTMLButtonElement>('[data-sidebar="rail"]');
    const wrapper = container.querySelector<HTMLElement>('[data-slot="sidebar-wrapper"]');
    expect(rail).not.toBeNull();
    expect(wrapper).not.toBeNull();
    if (!rail) throw new Error("Missing sidebar rail");
    if (!wrapper) throw new Error("Missing sidebar wrapper");
    expect(rail.className).toContain("cursor-pointer");
    expect(wrapper.getAttribute("style")).toContain("--sidebar-width: 280px");
  });

  it("clicks the shared sidebar rail to collapse the desktop sidebar", () => {
    const { container } = renderWithSidebar(
      <AdminSidebarShell
        showNavSkeleton={false}
        showOrgNavErrorOverlay={false}
        mainItems={[]}
        collapsible="icon"
      />,
    );

    const rail = container.querySelector<HTMLButtonElement>('[data-sidebar="rail"]');
    const sidebar = container.querySelector<HTMLElement>('[data-slot="sidebar"]');

    expect(rail).not.toBeNull();
    expect(sidebar).not.toBeNull();
    if (!rail) throw new Error("Missing sidebar rail");
    expect(sidebar).toHaveAttribute("data-layout-state", "expanded");

    fireEvent.click(rail);

    expect(sidebar).toHaveAttribute("data-layout-state", "collapsed");
  });

  it("renders full-width browse/chat tabs at the top of the sidebar", () => {
    const { container } = renderWithSidebar(
      <AdminSidebarShell
        showNavSkeleton={false}
        showOrgNavErrorOverlay={false}
        mainItems={[]}
        collapsible="icon"
      />,
    );

    const header = container.querySelector('[data-slot="sidebar-header"]');
    const brandingRow = header?.firstElementChild as HTMLElement | null;
    const tablist = screen.getByRole("tablist", { name: "common:SIDEBAR_TOP_TABS_LABEL" });
    const browseTab = screen.getByRole("tab", { name: "common:SIDEBAR_TOP_TAB_BROWSE" });
    const inboxTab = screen.getByRole("tab", { name: "Inbox" });
    const chatTab = screen.getByRole("tab", { name: "common:SIDEBAR_TOP_TAB_CHAT" });

    expect(screen.getByTestId("sidebar-brand-logo")).toHaveAttribute("data-width", "108");
    expect(screen.getByTestId("sidebar-brand-icon-logo")).toHaveAttribute("data-size", "32");
    expect(screen.getByTestId("sidebar-workspace-switcher")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar-workspace-switcher")).toHaveAttribute(
      "data-variant",
      "sidebar",
    );
    expect(
      within(brandingRow as HTMLElement).getByRole("button", { name: "Toggle sidebar" }),
    ).toBeInTheDocument();
    expect(header?.className).toContain("py-2");
    expect(header?.className).toContain("px-0");
    expect(brandingRow?.className).toContain("px-3");
    expect(brandingRow?.className).toContain("py-2");
    expect(tablist.className).toContain("h-10");
    expect(tablist.className).toContain("w-full");
    expect(tablist.className).toContain("justify-start");
    expect(tablist.className).toContain("rounded-md");
    expect(browseTab).toHaveAttribute("data-state", "active");
    expect(inboxTab).toHaveAttribute("data-state", "inactive");
    expect(chatTab).toHaveAttribute("data-state", "inactive");
    expect(browseTab.className).toContain("h-10");
    expect(browseTab.className).toContain("min-w-10");
    expect(browseTab.className).toContain("rounded-md");
    expect(browseTab.className).toContain("hover:bg-accent");
    expect(browseTab.className).toContain("hover:text-accent-foreground");
    expect(browseTab.className).toContain("dark:hover:bg-accent/50");
    expect(browseTab.className).toContain("data-[state=active]:bg-accent");
    expect(browseTab.className).toContain("data-[state=active]:text-accent-foreground");
    expect(browseTab.className).toContain("dark:data-[state=active]:bg-accent/50");
    expect(browseTab.className).toContain("data-[state=active]:px-3");
    expect(inboxTab.className).toContain("data-[state=inactive]:w-10");
    expect(chatTab.className).toContain("data-[state=inactive]:w-10");
    expect(browseTab).toHaveTextContent("common:SIDEBAR_TOP_TAB_BROWSE");
    expect(inboxTab).toHaveTextContent("Inbox");
    expect(chatTab).toHaveTextContent("common:SIDEBAR_TOP_TAB_CHAT");
    expect(inboxTab.querySelector("span:last-child")?.className).toContain("hidden");
    expect(chatTab.querySelector("span:last-child")?.className).toContain("hidden");
    expect(screen.getByTestId("sidebar-command-trigger")).toHaveClass("h-10", "w-10");
  });

  it("keeps the browse pill fixed when an active project is present", () => {
    renderWithSidebar(
      <AdminSidebarShell
        showNavSkeleton={false}
        showOrgNavErrorOverlay={false}
        mainItems={[]}
        browseProjects={[
          {
            projectId: "project-alpha",
            workspaceId: "workspace-alpha",
            name: "Project Alpha",
            description: "Primary publishing surface",
            enterable: true,
            iconMode: "emoji",
            iconEmoji: "A",
          },
          {
            projectId: "project-beta",
            workspaceId: "workspace-beta",
            name: "Project Beta",
            description: "Secondary sandbox",
            enterable: false,
          },
        ]}
        activeBrowseProjectId="project-alpha"
        collapsible="icon"
      />,
    );

    const browseTab = screen.getByRole("tab", { name: "common:SIDEBAR_TOP_TAB_BROWSE" });

    expect(browseTab).toHaveTextContent("common:SIDEBAR_TOP_TAB_BROWSE");
    expect(browseTab).not.toHaveTextContent("Project Alpha");
    expect(browseTab.className).toContain("data-[state=active]:max-w-[7rem]");
    expect(browseTab.querySelector('[aria-label="Project Alpha"]')).toBeNull();
  });

  it("wraps the active pill with button-style click affordance across browse, inbox, and chat", async () => {
    const user = userEvent.setup();

    renderWithSidebar(
      <AdminSidebarShell
        showNavSkeleton={false}
        showOrgNavErrorOverlay={false}
        mainItems={[]}
        collapsible="icon"
      />,
    );

    const browseTab = screen.getByRole("tab", { name: "common:SIDEBAR_TOP_TAB_BROWSE" });
    expect(browseTab.closest("[data-active-pill-button]")).not.toBeNull();

    await user.click(screen.getByRole("tab", { name: "Inbox" }));
    const inboxTab = screen.getByRole("tab", { name: "Inbox" });
    expect(inboxTab.closest("[data-active-pill-button]")).not.toBeNull();
    expect(screen.queryByRole("menu")).toBeNull();

    await user.click(screen.getByRole("tab", { name: "common:SIDEBAR_TOP_TAB_CHAT" }));
    const chatTab = screen.getByRole("tab", { name: "common:SIDEBAR_TOP_TAB_CHAT" });
    expect(chatTab.closest("[data-active-pill-button]")).not.toBeNull();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("opens a browse dropdown from the active pill and lists workspace projects plus global targets", async () => {
    const user = userEvent.setup();

    renderWithSidebar(
      <AdminSidebarShell
        showNavSkeleton={false}
        showOrgNavErrorOverlay={false}
        mainItems={[]}
        browseProjects={[
          {
            projectId: "project-alpha",
            workspaceId: "workspace-alpha",
            name: "Project Alpha",
            description: "Primary publishing surface",
            enterable: true,
            iconMode: "emoji",
            iconEmoji: "A",
          },
          {
            projectId: "project-beta",
            workspaceId: "workspace-alpha",
            name: "Project Beta",
            description: "Secondary sandbox",
            enterable: true,
            iconMode: "emoji",
            iconEmoji: "B",
          },
          {
            projectId: "project-gamma",
            workspaceId: "workspace-gamma",
            name: "Project Gamma",
            description: "Another workspace",
            enterable: true,
          },
        ]}
        activeBrowseProjectId="project-alpha"
        collapsible="icon"
      />,
    );

    await user.click(screen.getByRole("tab", { name: "common:SIDEBAR_TOP_TAB_BROWSE" }));

    const menu = screen.getByRole("menu");

    const projectAlphaItem = within(menu).getByRole("menuitem", { name: /Project Alpha/ });
    const projectBetaItem = within(menu).getByRole("menuitem", { name: /Project Beta/ });
    const allProjectsItem = within(menu).getByRole("menuitem", { name: "nav:NAV_ALL_PROJECTS" });
    const homeItem = within(menu).getByRole("menuitem", { name: "nav:NAV_HOME" });
    expect(projectAlphaItem).toBeInTheDocument();
    expect(within(menu).getByText("Primary publishing surface")).toBeInTheDocument();
    expect(projectBetaItem).toBeInTheDocument();
    expect(within(menu).getByText("Secondary sandbox")).toBeInTheDocument();
    expect(within(menu).queryByText("Project Gamma")).toBeNull();
    expect(allProjectsItem).toBeInTheDocument();
    expect(homeItem).toBeInTheDocument();
    const menuItems = within(menu).getAllByRole("menuitem");
    expect(menuItems.indexOf(allProjectsItem)).toBeGreaterThan(menuItems.indexOf(projectBetaItem));
    expect(menuItems.indexOf(homeItem)).toBeGreaterThan(menuItems.indexOf(allProjectsItem));
  });

  it("renders real project icons in dropdown items", async () => {
    const user = userEvent.setup();

    renderWithSidebar(
      <AdminSidebarShell
        showNavSkeleton={false}
        showOrgNavErrorOverlay={false}
        mainItems={[]}
        browseProjects={[
          {
            projectId: "project-alpha",
            workspaceId: "workspace-alpha",
            name: "Project Alpha",
            description: "Primary publishing surface",
            enterable: true,
            iconMode: "image",
            iconUrl: "/assets/project-alpha-icon",
          },
          {
            projectId: "project-beta",
            workspaceId: "workspace-alpha",
            name: "Project Beta",
            description: "Secondary sandbox",
            enterable: true,
            iconMode: "glyph",
            iconColor: "#123456",
            iconGlyph: "rocket",
          },
        ]}
        activeBrowseProjectId="project-alpha"
        collapsible="icon"
      />,
    );

    const browseTab = screen.getByRole("tab", { name: "common:SIDEBAR_TOP_TAB_BROWSE" });
    expect(browseTab.querySelector('img[alt="Project Alpha"]')).toBeNull();

    await user.click(browseTab);

    const menu = screen.getByRole("menu");
    const projectAlphaItem = within(menu).getByRole("menuitem", { name: /Project Alpha/ });
    const projectBetaItem = within(menu).getByRole("menuitem", { name: /Project Beta/ });

    expect(projectAlphaItem.querySelector('img[alt="Project Alpha"]')).not.toBeNull();
    expect(projectBetaItem.querySelector("svg")).not.toBeNull();
  });

  it("navigates from the browse dropdown to another project, all projects, and home", async () => {
    const user = userEvent.setup();

    renderWithSidebar(
      <AdminSidebarShell
        showNavSkeleton={false}
        showOrgNavErrorOverlay={false}
        mainItems={[]}
        browseProjects={[
          {
            projectId: "project-alpha",
            workspaceId: "workspace-alpha",
            name: "Project Alpha",
            description: "Primary publishing surface",
            enterable: true,
          },
          {
            projectId: "project-beta",
            workspaceId: "workspace-alpha",
            name: "Project Beta",
            description: "Secondary sandbox",
            enterable: true,
          },
        ]}
        activeBrowseProjectId="project-alpha"
        collapsible="icon"
      />,
    );

    await user.click(screen.getByRole("tab", { name: "common:SIDEBAR_TOP_TAB_BROWSE" }));
    await user.click(screen.getByRole("menuitem", { name: /Project Beta/ }));

    expect(navigateMock).toHaveBeenCalledWith({ to: "/projects/project-beta" });

    await user.click(screen.getByRole("tab", { name: "common:SIDEBAR_TOP_TAB_BROWSE" }));
    await user.click(screen.getByRole("menuitem", { name: "nav:NAV_ALL_PROJECTS" }));

    expect(navigateMock).toHaveBeenCalledWith({ to: "/projects" });

    await user.click(screen.getByRole("tab", { name: "common:SIDEBAR_TOP_TAB_BROWSE" }));
    await user.click(screen.getByRole("menuitem", { name: "nav:NAV_HOME" }));

    expect(navigateMock).toHaveBeenCalledWith({ to: "/" });
  });

  it("shows all browse projects in global mode and renders fallback description when missing", async () => {
    const user = userEvent.setup();

    renderWithSidebar(
      <AdminSidebarShell
        showNavSkeleton={false}
        showOrgNavErrorOverlay={false}
        mainItems={[]}
        browseProjects={[
          {
            projectId: "project-alpha",
            workspaceId: "workspace-alpha",
            name: "Project Alpha",
            description: null,
            enterable: true,
          },
          {
            projectId: "project-beta",
            workspaceId: "workspace-beta",
            name: "Project Beta",
            description: "Secondary sandbox",
            enterable: true,
          },
        ]}
        activeBrowseProjectId={null}
        collapsible="icon"
      />,
    );

    await user.click(screen.getByRole("tab", { name: "common:SIDEBAR_TOP_TAB_BROWSE" }));

    const menu = screen.getByRole("menu");

    expect(within(menu).getByRole("menuitem", { name: /Project Alpha/ })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /Project Beta/ })).toBeInTheDocument();
    expect(
      within(menu).getByText("common:SIDEBAR_BROWSE_PROJECT_DESCRIPTION_FALLBACK"),
    ).toBeInTheDocument();
    expect(within(menu).getByText("Secondary sandbox")).toBeInTheDocument();
  });

  it("keeps all projects above the home divider when there are no browse projects", async () => {
    const user = userEvent.setup();

    renderWithSidebar(
      <AdminSidebarShell
        showNavSkeleton={false}
        showOrgNavErrorOverlay={false}
        mainItems={[]}
        browseProjects={[]}
        activeBrowseProjectId={null}
        collapsible="icon"
      />,
    );

    await user.click(screen.getByRole("tab", { name: "common:SIDEBAR_TOP_TAB_BROWSE" }));

    const menu = screen.getByRole("menu");

    expect(within(menu).getByRole("separator")).toBeInTheDocument();
    const allProjectsItem = within(menu).getByRole("menuitem", { name: "nav:NAV_ALL_PROJECTS" });
    const homeItem = within(menu).getByRole("menuitem", { name: "nav:NAV_HOME" });
    expect(allProjectsItem).toBeInTheDocument();
    expect(homeItem).toBeInTheDocument();
    const menuItems = within(menu).getAllByRole("menuitem");
    expect(menuItems.indexOf(homeItem)).toBeGreaterThan(menuItems.indexOf(allProjectsItem));
  });

  it("switches sidebar content between browse, inbox, and chat tabs", async () => {
    const user = userEvent.setup();

    renderWithSidebar(
      <AdminSidebarShell
        showNavSkeleton={false}
        showOrgNavErrorOverlay={false}
        mainItems={[]}
        collapsible="icon"
      />,
    );

    expect(screen.getByTestId("admin-sider-nav")).toBeInTheDocument();
    expect(screen.queryByTestId("sidebar-inbox-content")).toBeNull();

    await user.click(screen.getByRole("tab", { name: "Inbox" }));
    await waitFor(() => {
      expect(screen.getByTestId("sidebar-inbox-content")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("admin-sider-nav")).toBeNull();

    await user.click(screen.getByRole("tab", { name: "common:SIDEBAR_TOP_TAB_CHAT" }));
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "common:SIDEBAR_CHAT_EMPTY_TITLE" }),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText((content) => content.includes("common:SIDEBAR_CHAT_EMPTY_DESC")),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("sidebar-inbox-content")).toBeNull();

    await user.click(screen.getByRole("tab", { name: "common:SIDEBAR_TOP_TAB_BROWSE" }));
    await waitFor(() => {
      expect(screen.getByTestId("admin-sider-nav")).toBeInTheDocument();
    });
  });

  it("uses the normalized Agent Thread list when the scene runtime is available", async () => {
    const user = userEvent.setup();

    renderWithSidebar(
      <AdminSidebarShell
        showNavSkeleton={false}
        showOrgNavErrorOverlay={false}
        mainItems={[]}
        collapsible="icon"
        assistantAvailable
      />,
    );

    await user.click(screen.getByRole("tab", { name: "common:SIDEBAR_TOP_TAB_CHAT" }));

    expect(await screen.findByTestId("agent-thread-sidebar")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "common:SIDEBAR_CHAT_EMPTY_TITLE" }),
    ).not.toBeInTheDocument();
  });

  it("shows browse navigation instead of inbox or chat panels while icon-collapsed", async () => {
    const user = userEvent.setup();

    const { unmount } = renderWithSidebar(
      <AdminSidebarShell
        showNavSkeleton={false}
        showOrgNavErrorOverlay={false}
        mainItems={[]}
        collapsible="icon"
      />,
    );

    await user.click(screen.getByRole("tab", { name: "Inbox" }));
    await waitFor(() => {
      expect(screen.getByTestId("sidebar-inbox-content")).toBeInTheDocument();
    });

    const toggleInboxSidebar = within(
      document.querySelector<HTMLElement>('[data-slot="sidebar-header"] > div') as HTMLElement,
    ).getByRole("button", { name: "Toggle sidebar" });
    fireEvent.click(toggleInboxSidebar);

    await waitFor(() => {
      expect(screen.queryByTestId("sidebar-inbox-content")).toBeNull();
      expect(screen.getByTestId("admin-sider-nav")).toBeInTheDocument();
    });

    unmount();

    renderWithSidebar(
      <AdminSidebarShell
        showNavSkeleton={false}
        showOrgNavErrorOverlay={false}
        mainItems={[]}
        collapsible="icon"
      />,
    );

    await user.click(screen.getByRole("tab", { name: "common:SIDEBAR_TOP_TAB_CHAT" }));
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "common:SIDEBAR_CHAT_EMPTY_TITLE" }),
      ).toBeInTheDocument();
    });

    const toggleChatSidebar = within(
      document.querySelector<HTMLElement>('[data-slot="sidebar-header"] > div') as HTMLElement,
    ).getByRole("button", { name: "Toggle sidebar" });
    fireEvent.click(toggleChatSidebar);

    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: "common:SIDEBAR_CHAT_EMPTY_TITLE" }),
      ).not.toBeInTheDocument();
      expect(screen.getByTestId("admin-sider-nav")).toBeInTheDocument();
    });
  });

  it("uses a changing browse menu tree key for global and project menu switches", async () => {
    const globalItems: readonly AdminNavItem[] = [
      {
        key: "projects",
        label: "All projects",
        labelKey: "nav:NAV_ALL_PROJECTS",
        to: "/projects",
        icon: House,
      },
    ];
    const projectItems: readonly AdminNavItem[] = [
      {
        key: "content",
        label: "Content",
        labelKey: "nav:NAV_CONTENT",
        groupLabelBeforeKey: "nav:NAV_GROUP_WEBSITE",
        to: "/projects/project-alpha/content",
        icon: FileText,
        children: [
          {
            key: "entries",
            label: "Entries",
            labelKey: "nav:NAV_CONTENT_ENTRIES",
            to: "/projects/project-alpha/content/entries",
            icon: FileText,
          },
        ],
      },
    ];

    const { container, rerender } = render(
      <SidebarProvider defaultOpen className="h-screen">
        <AdminSidebarShell
          showNavSkeleton={false}
          showOrgNavErrorOverlay={false}
          mainItems={globalItems}
          collapsible="icon"
        />
      </SidebarProvider>,
    );

    expect(container.querySelector('[data-menu-tree-key*="projects"]')).not.toBeNull();
    expect(container.querySelector('[data-menu-tree-key*="/projects"]')).not.toBeNull();

    rerender(
      <SidebarProvider defaultOpen className="h-screen">
        <AdminSidebarShell
          showNavSkeleton={false}
          showOrgNavErrorOverlay={false}
          mainItems={projectItems}
          collapsible="icon"
        />
      </SidebarProvider>,
    );

    await waitFor(() => {
      expect(container.querySelector('[data-menu-tree-key*="content"]')).not.toBeNull();
      expect(
        container.querySelector('[data-menu-tree-key*="/projects/project-alpha/content"]'),
      ).not.toBeNull();
      expect(container.querySelector('[data-menu-tree-key*="entries"]')).not.toBeNull();
    });
  });

  it("shows a compact dot on the inactive inbox tab when unread updates are waiting", () => {
    renderWithSidebar(
      <AdminSidebarShell
        showNavSkeleton={false}
        showOrgNavErrorOverlay={false}
        mainItems={[]}
        showInboxBadge
        unreadInboxCount={128}
        collapsible="icon"
      />,
    );

    const inboxTab = screen.getByRole("tab", { name: "Inbox" });
    const dot = within(inboxTab).getByTestId("sidebar-inbox-dot");

    expect(dot).toHaveClass("absolute", "right-1.5", "top-1.5", "bg-red-500");
    expect(inboxTab.className).toContain("data-[state=inactive]:w-11");
    expect(inboxTab.className).toContain("data-[state=active]:pr-6");
  });

  it("shows a capped unread count badge on the active inbox tab", async () => {
    const user = userEvent.setup();

    renderWithSidebar(
      <AdminSidebarShell
        showNavSkeleton={false}
        showOrgNavErrorOverlay={false}
        mainItems={[]}
        showInboxBadge
        unreadInboxCount={128}
        collapsible="icon"
      />,
    );

    await user.click(screen.getByRole("tab", { name: "Inbox" }));

    const inboxTab = screen.getByRole("tab", { name: "Inbox" });
    const badge = within(inboxTab).getByTestId("sidebar-inbox-count-badge");

    expect(badge).toHaveTextContent("99+");
    expect(badge).toHaveClass(
      "absolute",
      "right-2",
      "top-1.5",
      "bg-red-500",
      "text-[9px]",
      "font-semibold",
    );
  });

  it("hides top header rows immediately when a fixed-open sidebar starts collapsing", () => {
    vi.useFakeTimers();

    try {
      const { container } = renderWithSidebar(
        <AdminSidebarShell
          showNavSkeleton={false}
          showOrgNavErrorOverlay={false}
          mainItems={[]}
          collapsible="icon"
        />,
      );

      const sidebar = container.querySelector<HTMLElement>('[data-slot="sidebar"]');
      const brandingRow = container.querySelector<HTMLElement>(
        '[data-slot="sidebar-header"] > div',
      );
      const toggleButton = within(brandingRow as HTMLElement).getByRole("button", {
        name: "Toggle sidebar",
      });

      expect(sidebar).not.toBeNull();
      expect(
        screen.getByRole("tablist", { name: "common:SIDEBAR_TOP_TABS_LABEL" }),
      ).toBeInTheDocument();
      expect(screen.getByTestId("sidebar-workspace-switcher")).toBeInTheDocument();

      fireEvent.click(toggleButton);

      expect(sidebar).toHaveAttribute("data-layout-state", "collapsed");
      expect(sidebar).toHaveAttribute("data-state", "collapsed");
      expect(sidebar).toHaveAttribute("data-motion-phase", "collapsing");
      expect(screen.queryByRole("tablist", { name: "common:SIDEBAR_TOP_TABS_LABEL" })).toBeNull();
      expect(screen.getByTestId("sidebar-brand-icon-logo")).toBeInTheDocument();
      expect(screen.getByTestId("sidebar-workspace-switcher")).toBeInTheDocument();
      expect(screen.getByTestId("sidebar-brand-logo")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("hides the top tabs in collapsed state and shows them during hover preview", () => {
    vi.useFakeTimers();

    try {
      const view = render(
        <SidebarProvider defaultOpen={false} className="h-screen">
          <AdminSidebarShell
            showNavSkeleton={false}
            showOrgNavErrorOverlay={false}
            mainItems={[]}
            collapsible="icon"
          />
        </SidebarProvider>,
      );

      const sidebarContainer = view.container.querySelector<HTMLElement>(
        '[data-slot="sidebar-container"]',
      );

      expect(screen.queryByRole("tablist", { name: "common:SIDEBAR_TOP_TABS_LABEL" })).toBeNull();
      expect(screen.getByTestId("sidebar-brand-icon-logo")).toBeInTheDocument();
      expect(screen.getByTestId("sidebar-workspace-switcher")).toBeInTheDocument();
      expect(screen.getByTestId("sidebar-brand-logo")).toBeInTheDocument();
      expect(sidebarContainer).not.toBeNull();

      act(() => {
        fireEvent.pointerEnter(sidebarContainer!);
        fireEvent.pointerMove(sidebarContainer!);
        vi.advanceTimersByTime(70);
      });

      expect(
        screen.getByRole("tablist", { name: "common:SIDEBAR_TOP_TABS_LABEL" }),
      ).toBeInTheDocument();
      expect(screen.getByTestId("sidebar-brand-logo")).toBeInTheDocument();
      expect(screen.getByTestId("sidebar-workspace-switcher")).toBeInTheDocument();
      expect(screen.getByTestId("sidebar-brand-icon-logo")).toBeInTheDocument();

      act(() => {
        fireEvent.pointerLeave(sidebarContainer!);
        vi.advanceTimersByTime(180);
      });

      expect(screen.queryByRole("tablist", { name: "common:SIDEBAR_TOP_TABS_LABEL" })).toBeNull();
      expect(screen.getByTestId("sidebar-brand-icon-logo")).toBeInTheDocument();
      expect(screen.getByTestId("sidebar-workspace-switcher")).toBeInTheDocument();
      expect(screen.getByTestId("sidebar-brand-logo")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("clicking the shared sidebar rail during hover preview collapses the sidebar", () => {
    vi.useFakeTimers();

    try {
      const { container } = render(
        <SidebarProvider defaultOpen={false} className="h-screen">
          <AdminSidebarShell
            showNavSkeleton={false}
            showOrgNavErrorOverlay={false}
            mainItems={[]}
            collapsible="icon"
          />
        </SidebarProvider>,
      );

      const sidebar = container.querySelector<HTMLElement>('[data-slot="sidebar"]');
      const sidebarContainer = container.querySelector<HTMLElement>(
        '[data-slot="sidebar-container"]',
      );
      const rail = container.querySelector<HTMLButtonElement>('[data-sidebar="rail"]');

      expect(sidebar).not.toBeNull();
      expect(sidebarContainer).not.toBeNull();
      expect(rail).not.toBeNull();
      if (!rail) throw new Error("Missing sidebar rail");

      act(() => {
        fireEvent.pointerEnter(sidebarContainer!);
        fireEvent.pointerMove(sidebarContainer!);
        vi.advanceTimersByTime(70);
      });

      expect(sidebar).toHaveAttribute("data-state", "expanded");
      expect(sidebar).toHaveAttribute("data-hover-preview", "true");

      fireEvent.click(rail);

      expect(sidebar).toHaveAttribute("data-layout-state", "expanded");
      expect(sidebar).toHaveAttribute("data-hover-preview", "");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not render the sidebar rail when the sidebar is fixed", () => {
    const { container } = renderWithSidebar(
      <AdminSidebarShell
        showNavSkeleton={false}
        showOrgNavErrorOverlay={false}
        mainItems={[]}
        collapsible="none"
      />,
    );

    expect(container.querySelector('[data-sidebar="rail"]')).toBeNull();
  });

  it("temporarily expands a collapsed desktop sidebar after the hover threshold and collapses after the leave delay", () => {
    vi.useFakeTimers();

    try {
      const view = render(
        <SidebarProvider defaultOpen={false} className="h-screen">
          <AdminSidebarShell
            showNavSkeleton={false}
            showOrgNavErrorOverlay={false}
            mainItems={[]}
            collapsible="icon"
          />
        </SidebarProvider>,
      );

      const sidebar = view.container.querySelector<HTMLElement>('[data-slot="sidebar"]');
      const sidebarContainer = view.container.querySelector<HTMLElement>(
        '[data-slot="sidebar-container"]',
      );
      const sidebarContent = view.container.querySelector<HTMLElement>(
        '[data-slot="sidebar-content"]',
      );
      const sidebarInner = view.container.querySelector<HTMLElement>('[data-slot="sidebar-inner"]');

      expect(sidebar).not.toBeNull();
      expect(sidebarContainer).not.toBeNull();
      expect(sidebarContent).not.toBeNull();
      expect(sidebarInner).not.toBeNull();
      expect(sidebar).toHaveAttribute("data-state", "collapsed");
      expect(sidebar).toHaveAttribute("data-layout-state", "collapsed");
      expect(sidebar).toHaveAttribute("data-motion-phase", "idle");
      expect(sidebar).toHaveAttribute("data-collapsible", "icon");
      expect(sidebar).toHaveAttribute("data-layout-collapsible", "icon");
      expect(sidebar?.className).toContain("w-(--sidebar-width)");
      expect(sidebar?.className).toContain(
        "data-[layout-collapsible=icon]:w-(--sidebar-width-icon)",
      );
      expect(sidebarContent).not.toHaveAttribute("inert");

      act(() => {
        fireEvent.pointerEnter(sidebarContainer!);
        fireEvent.pointerMove(sidebarContainer!);
        vi.advanceTimersByTime(50);
      });
      expect(sidebar).toHaveAttribute("data-state", "collapsed");
      expect(sidebar).toHaveAttribute("data-motion-phase", "idle");

      act(() => {
        vi.advanceTimersByTime(20);
      });
      expect(sidebar).toHaveAttribute("data-state", "expanded");
      expect(sidebar).toHaveAttribute("data-layout-state", "collapsed");
      expect(sidebar).toHaveAttribute("data-motion-phase", "expanding");
      expect(sidebar).toHaveAttribute("data-hover-preview", "true");
      expect(sidebar).toHaveAttribute("data-collapsible", "");
      expect(sidebar).toHaveAttribute("data-layout-collapsible", "icon");
      expect(sidebar?.className).toContain(
        "data-[layout-collapsible=icon]:w-(--sidebar-width-icon)",
      );
      expect(sidebarContainer?.className).toContain("group-data-[side=left]:border-r");
      expect(sidebarInner?.className).not.toContain("rounded-r-xl");
      expect(sidebarInner?.className).not.toContain("rounded-l-xl");
      expect(sidebarInner?.className).not.toContain("shadow-2xl");

      act(() => {
        fireEvent.pointerLeave(sidebarContainer!);
        vi.advanceTimersByTime(140);
      });
      expect(sidebar).toHaveAttribute("data-state", "expanded");
      expect(sidebar).toHaveAttribute("data-layout-state", "collapsed");
      expect(sidebar).toHaveAttribute("data-motion-phase", "expanding");
      expect(sidebar).toHaveAttribute("data-layout-collapsible", "icon");
      expect(sidebar).toHaveAttribute("data-hover-preview", "true");

      act(() => {
        vi.advanceTimersByTime(39);
      });
      expect(sidebar).toHaveAttribute("data-hover-preview", "true");

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(sidebar).toHaveAttribute("data-state", "collapsed");
      expect(sidebar).toHaveAttribute("data-layout-state", "collapsed");
      expect(sidebar).toHaveAttribute("data-hover-preview", "");
      expect(sidebar).toHaveAttribute("data-motion-phase", "collapsing");
      expect(sidebar).toHaveAttribute("data-collapsible", "icon");

      act(() => {
        vi.advanceTimersByTime(140);
      });
      expect(sidebar).toHaveAttribute("data-state", "collapsed");
      expect(sidebar).toHaveAttribute("data-motion-phase", "collapsing");

      act(() => {
        vi.advanceTimersByTime(139);
      });
      expect(sidebar).toHaveAttribute("data-state", "collapsed");
      expect(sidebar).toHaveAttribute("data-motion-phase", "collapsing");

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(sidebar).toHaveAttribute("data-state", "collapsed");
      expect(sidebar).toHaveAttribute("data-layout-state", "collapsed");
      expect(sidebar).toHaveAttribute("data-collapsible", "icon");
      expect(sidebarContent).not.toHaveAttribute("inert");

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(sidebar).toHaveAttribute("data-motion-phase", "idle");
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores quick pointer passes over the collapsed sidebar", () => {
    vi.useFakeTimers();

    try {
      const view = render(
        <SidebarProvider defaultOpen={false} className="h-screen">
          <AdminSidebarShell
            showNavSkeleton={false}
            showOrgNavErrorOverlay={false}
            mainItems={[]}
            collapsible="icon"
          />
        </SidebarProvider>,
      );

      const sidebar = view.container.querySelector<HTMLElement>('[data-slot="sidebar"]');
      const sidebarContainer = view.container.querySelector<HTMLElement>(
        '[data-slot="sidebar-container"]',
      );

      expect(sidebar).not.toBeNull();
      expect(sidebarContainer).not.toBeNull();

      act(() => {
        fireEvent.pointerEnter(sidebarContainer!);
        vi.advanceTimersByTime(50);
        fireEvent.pointerLeave(sidebarContainer!);
        vi.runAllTimers();
      });

      expect(sidebar).toHaveAttribute("data-state", "collapsed");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps collapsed navigation content interactive before hover preview expands", () => {
    const view = render(
      <SidebarProvider defaultOpen={false} className="h-screen">
        <AdminSidebarShell
          showNavSkeleton={false}
          showOrgNavErrorOverlay={false}
          mainItems={[]}
          collapsible="icon"
        />
      </SidebarProvider>,
    );

    const sidebarContent = view.container.querySelector<HTMLElement>(
      '[data-slot="sidebar-content"]',
    );
    const navButton = screen.getByTestId("admin-sider-nav");

    expect(sidebarContent).not.toHaveAttribute("inert");
    fireEvent.click(navButton);
    expect(navClickSpy).toHaveBeenCalledTimes(1);
  });

  it("keeps hover preview expanded while a layout dropdown menu stays open", () => {
    vi.useFakeTimers();

    try {
      const view = render(
        <SidebarProvider defaultOpen={false} className="h-screen">
          <AdminSidebarShell
            showNavSkeleton={false}
            showOrgNavErrorOverlay={false}
            mainItems={[]}
            collapsible="icon"
          />
          <div className="p-8">
            <TestLayoutMenu />
          </div>
        </SidebarProvider>,
      );

      const sidebar = view.container.querySelector<HTMLElement>('[data-slot="sidebar"]');
      const sidebarContainer = view.container.querySelector<HTMLElement>(
        '[data-slot="sidebar-container"]',
      );

      expect(sidebar).not.toBeNull();
      expect(sidebarContainer).not.toBeNull();

      act(() => {
        fireEvent.pointerEnter(sidebarContainer!);
        fireEvent.pointerMove(sidebarContainer!);
        vi.advanceTimersByTime(70);
      });

      expect(sidebar).toHaveAttribute("data-state", "expanded");
      expect(sidebar).toHaveAttribute("data-hover-preview", "true");

      act(() => {
        fireEvent.click(screen.getByRole("button", { name: "Open layout menu" }));
      });

      expect(screen.getByText("Menu action")).toBeInTheDocument();

      act(() => {
        fireEvent.pointerLeave(sidebarContainer!);
        vi.advanceTimersByTime(180);
        vi.advanceTimersByTime(250);
      });

      expect(sidebar).toHaveAttribute("data-state", "expanded");
      expect(sidebar).toHaveAttribute("data-hover-preview", "true");

      act(() => {
        fireEvent.click(screen.getByText("Close layout menu"));
      });

      expect(screen.queryByText("Menu action")).toBeNull();

      act(() => {
        vi.advanceTimersByTime(179);
      });

      expect(sidebar).toHaveAttribute("data-state", "expanded");
      expect(sidebar).toHaveAttribute("data-hover-preview", "true");

      act(() => {
        vi.runOnlyPendingTimers();
      });

      expect(sidebar).toHaveAttribute("data-state", "collapsed");
      expect(sidebar).toHaveAttribute("data-layout-state", "collapsed");
      expect(sidebar).toHaveAttribute("data-hover-preview", "");
    } finally {
      vi.useRealTimers();
    }
  });
});
