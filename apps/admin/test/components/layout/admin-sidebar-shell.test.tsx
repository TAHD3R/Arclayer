import * as React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminSidebarShell } from "@/components/layout/admin-sidebar-shell";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuIconItem,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";
import { SidebarProvider } from "@arclayer/ui/sidebar";

const { navClickSpy } = vi.hoisted(() => ({
  navClickSpy: vi.fn(),
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
  AdminCommandTrigger: (props: { variant?: "pill" | "icon" }) => (
    <div data-testid={props.variant === "icon" ? "sidebar-command-trigger" : "command-trigger"} />
  ),
}));

vi.mock("@/components/layout/admin-logo", () => ({
  AdminFullLogo: () => <div data-testid="sidebar-brand-logo" />,
}));

vi.mock("@/components/layout/admin-workspace-switcher", () => ({
  AdminWorkspaceSwitcher: () => <div data-testid="sidebar-workspace-switcher" />,
}));

vi.mock("@/components/ui/gradual-blur", () => ({
  default: () => null,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      if (key === "common:SIDEBAR_TOGGLE") return "Toggle sidebar";
      if (key === "common:SIDEBAR_RESIZE") return "Toggle sidebar";
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
    expect(wrapper.getAttribute("style")).toContain("--sidebar-width: 273px");
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
    const chatTab = screen.getByRole("tab", { name: "common:SIDEBAR_TOP_TAB_CHAT" });

    expect(screen.getByTestId("sidebar-brand-logo")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar-workspace-switcher")).toBeInTheDocument();
    expect(
      within(brandingRow as HTMLElement).getByRole("button", { name: "Toggle sidebar" }),
    ).toBeInTheDocument();
    expect(header?.className).toContain("py-2");
    expect(header?.className).toContain("px-0");
    expect(brandingRow?.className).toContain("px-4");
    expect(brandingRow?.className).toContain("py-2");
    expect(brandingRow?.className).toContain("pr-3");
    expect(tablist.className).toContain("h-9");
    expect(tablist.className).toContain("w-full");
    expect(tablist.className).toContain("justify-start");
    expect(browseTab).toHaveAttribute("data-state", "active");
    expect(chatTab).toHaveAttribute("data-state", "inactive");
    expect(browseTab.className).toContain("h-9");
    expect(browseTab.className).toContain("min-w-9");
    expect(browseTab.className).toContain("data-[state=active]:px-3");
    expect(chatTab.className).toContain("data-[state=inactive]:w-9");
    expect(browseTab).toHaveTextContent("common:SIDEBAR_TOP_TAB_BROWSE");
    expect(chatTab).toHaveTextContent("common:SIDEBAR_TOP_TAB_CHAT");
    expect(chatTab.querySelector("span:last-child")?.className).toContain("hidden");
    expect(screen.getByTestId("sidebar-command-trigger")).toBeInTheDocument();
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
      expect(screen.getByTestId("sidebar-brand-logo")).toBeInTheDocument();
      expect(screen.queryByTestId("sidebar-workspace-switcher")).toBeNull();
      expect(sidebarContainer).not.toBeNull();

      act(() => {
        fireEvent.pointerEnter(sidebarContainer!);
        fireEvent.pointerMove(sidebarContainer!);
        vi.advanceTimersByTime(70);
      });

      expect(
        screen.getByRole("tablist", { name: "common:SIDEBAR_TOP_TABS_LABEL" }),
      ).toBeInTheDocument();
      expect(screen.getByTestId("sidebar-workspace-switcher")).toBeInTheDocument();

      act(() => {
        fireEvent.pointerLeave(sidebarContainer!);
        vi.advanceTimersByTime(180);
      });

      expect(screen.queryByRole("tablist", { name: "common:SIDEBAR_TOP_TABS_LABEL" })).toBeNull();
      expect(screen.queryByTestId("sidebar-workspace-switcher")).toBeNull();
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
      expect(sidebar).toHaveAttribute("data-state", "expanded");
      expect(sidebar).toHaveAttribute("data-layout-state", "collapsed");
      expect(sidebar).toHaveAttribute("data-hover-preview", "");
      expect(sidebar).toHaveAttribute("data-motion-phase", "collapsing");
      expect(sidebar).toHaveAttribute("data-collapsible", "");

      act(() => {
        vi.advanceTimersByTime(140);
      });
      expect(sidebar).toHaveAttribute("data-state", "expanded");
      expect(sidebar).toHaveAttribute("data-motion-phase", "collapsing");

      act(() => {
        vi.advanceTimersByTime(139);
      });
      expect(sidebar).toHaveAttribute("data-state", "expanded");
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

      act(() => {
        vi.runOnlyPendingTimers();
      });

      expect(sidebar).toHaveAttribute("data-state", "expanded");
      expect(sidebar).toHaveAttribute("data-hover-preview", "");

      act(() => {
        vi.runOnlyPendingTimers();
      });

      expect(sidebar).toHaveAttribute("data-state", "collapsed");
      expect(sidebar).toHaveAttribute("data-layout-state", "collapsed");
    } finally {
      vi.useRealTimers();
    }
  });
});
