import * as React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { Settings2 } from "lucide-react";

import { AdminSidebarShell } from "@/components/layout/admin-sidebar-shell";
import { ProjectActionsDropdown } from "@/pages/usercenter/projects/components/project-actions-dropdown";
import type { ProjectMenuItem } from "@/pages/usercenter/projects/types";
import { SidebarProvider } from "@arclayer/ui/sidebar";

vi.mock("@/components/layout/admin-side-nav", () => ({
  AdminSiderNav: () => <button type="button">Nav item</button>,
}));

vi.mock("@/components/layout/admin-sidebar-skeleton", () => ({
  AdminSidebarMainMenuSkeleton: () => <div data-testid="admin-sidebar-main-skeleton" />,
}));

vi.mock("@/components/ui/gradual-blur", () => ({
  default: () => null,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      if (key === "common:SIDEBAR_TOGGLE") return "Toggle sidebar";
      return key;
    },
  }),
}));

const menuItems: ProjectMenuItem[] = [
  {
    key: "manage",
    icon: <Settings2 className="size-4" />,
    label: "Project settings",
    onClick: vi.fn(),
  },
];

function ProjectDropdownHarness() {
  return (
    <div className="p-8">
      <ProjectActionsDropdown menuItems={menuItems} />
    </div>
  );
}

describe("ProjectActionsDropdown", () => {
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

  it("keeps hover preview expanded while the project actions menu stays open", async () => {
    const user = userEvent.setup();
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
          <ProjectDropdownHarness />
        </SidebarProvider>,
      );

      const sidebar = view.container.querySelector<HTMLElement>('[data-slot="sidebar"]');
      const sidebarContainer = view.container.querySelector<HTMLElement>(
        '[data-slot="sidebar-container"]',
      );
      const trigger = screen.getByRole("button", { name: "" });

      expect(sidebar).not.toBeNull();
      expect(sidebarContainer).not.toBeNull();

      act(() => {
        fireEvent.pointerEnter(sidebarContainer!);
        fireEvent.pointerMove(sidebarContainer!);
        vi.advanceTimersByTime(70);
      });

      expect(sidebar).toHaveAttribute("data-state", "expanded");
      expect(sidebar).toHaveAttribute("data-hover-preview", "true");

      vi.useRealTimers();
      await user.click(trigger);

      expect(screen.getByRole("menuitem", { name: "Project settings" })).toBeInTheDocument();

      vi.useFakeTimers();
      act(() => {
        fireEvent.pointerLeave(sidebarContainer!);
        vi.advanceTimersByTime(180);
        vi.advanceTimersByTime(250);
      });

      expect(sidebar).toHaveAttribute("data-state", "expanded");
      expect(sidebar).toHaveAttribute("data-hover-preview", "true");

      vi.useRealTimers();
      act(() => {
        fireEvent.pointerDown(document.body);
        fireEvent.mouseDown(document.body);
        fireEvent.click(document.body);
      });

      expect(screen.queryByRole("menuitem", { name: "Project settings" })).toBeNull();

      await waitFor(() => {
        expect(sidebar).toHaveAttribute("data-state", "expanded");
        expect(sidebar).toHaveAttribute("data-hover-preview", "");
      });

      await waitFor(() => {
        expect(sidebar).toHaveAttribute("data-state", "collapsed");
        expect(sidebar).toHaveAttribute("data-layout-state", "collapsed");
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
