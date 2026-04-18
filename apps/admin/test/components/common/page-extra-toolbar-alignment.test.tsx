import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { ChromeTabs, ChromeTabsProvider } from "@arclayer/ui/chrome-tabs";

import { buildDataTableToolsLabels } from "@/components/common/data-table-tools-labels";
import { UserCenterProjectsToolbar } from "@/pages/usercenter/projects/components/usercenter-projects-toolbar";
import { TeamInvitationsPageExtra } from "@/pages/workspaces/team/shared/components/team-invitations-page-extra";

vi.mock("@arclayer/ui/data-table", () => ({
  DataTableToolbarTools: () => <div data-testid="data-table-tools">tools</div>,
}));

const TOOLBAR_SELECTOR = "div.flex.flex-wrap.justify-between";

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

  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    value: vi.fn(),
    writable: true,
  });
});

function renderWithChromeTabs(ui: React.ReactElement) {
  return render(
    <ChromeTabsProvider
      labels={{ scrollLeftAriaLabel: "scroll left", scrollRightAriaLabel: "scroll right" }}
    >
      <ChromeTabs defaultValue="active">{ui}</ChromeTabs>
    </ChromeTabsProvider>,
  );
}

function getToolbarFromTablist() {
  const tablist = screen.getByRole("tablist");
  const toolbar = tablist.closest(TOOLBAR_SELECTOR);
  expect(toolbar).not.toBeNull();
  return toolbar as HTMLDivElement;
}

const buildLabels = (overrides: Record<string, string> = {}) =>
  buildDataTableToolsLabels((key) => overrides[key] ?? key);

describe("PageExtraToolbar alignment", () => {
  it("keeps projects tabs vertically centered with trailing actions", () => {
    renderWithChromeTabs(
      <UserCenterProjectsToolbar
        t={(key) =>
          (
            ({
              "account:ACCOUNT_PROJECTS_TAB_ACTIVE": "Active",
              "account:ACCOUNT_PROJECTS_TAB_ARCHIVED": "Archived",
              "account:ACCOUNT_PROJECTS_SEARCH_PLACEHOLDER": "Search projects",
              "common:CLEAR": "Clear",
            }) as const
          )[
            key as
              | "account:ACCOUNT_PROJECTS_TAB_ACTIVE"
              | "account:ACCOUNT_PROJECTS_TAB_ARCHIVED"
              | "account:ACCOUNT_PROJECTS_SEARCH_PLACEHOLDER"
              | "common:CLEAR"
          ] ?? key
        }
        table={{} as never}
        searchInput=""
        onSearchInputChange={() => undefined}
        viewMode="card"
        onViewModeChange={() => undefined}
        rowHeight="medium"
        onRowHeightChange={() => undefined}
        wrapHeaders={false}
        onWrapHeadersChange={() => undefined}
        onRefresh={() => undefined}
        refreshing={false}
        labels={buildLabels()}
      />,
    );

    const toolbar = getToolbarFromTablist();
    expect(toolbar).toHaveClass("items-center");
    expect(toolbar).not.toHaveClass("items-start");
  });

  it("keeps invitation tabs vertically centered with trailing tools and search", () => {
    renderWithChromeTabs(
      <TeamInvitationsPageExtra
        tabs={[
          { value: "pending", label: "待处理" },
          { value: "accepted", label: "已接受" },
          { value: "links", label: "邀请链接" },
        ]}
        table={{} as never}
        searchInput=""
        onSearchInputChange={() => undefined}
        searchPlaceholder="通过电子邮箱/角色搜索待处理邀请"
        clearLabel="清空"
        rowHeight="medium"
        onRowHeightChange={() => undefined}
        wrapHeaders={false}
        onWrapHeadersChange={() => undefined}
        onRefresh={() => undefined}
        refreshing={false}
        labels={buildLabels()}
      />,
    );

    const toolbar = getToolbarFromTablist();
    expect(toolbar).toHaveClass("items-center");
    expect(toolbar).not.toHaveClass("items-start");
  });
});
