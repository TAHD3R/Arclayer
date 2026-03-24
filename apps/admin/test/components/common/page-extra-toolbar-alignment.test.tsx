import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { ChromeTabs, ChromeTabsProvider } from "@arclayer/ui/chrome-tabs";

import { OrganizationWorkspacesToolbar } from "@/pages/organization/workspaces/components/organization-workspaces-toolbar";
import { TeamInvitationsPageExtra } from "@/pages/_shared/team/components/team-invitations-page-extra";

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

describe("PageExtraToolbar alignment", () => {
  it("keeps organization workspaces tabs vertically centered with trailing actions", () => {
    renderWithChromeTabs(
      <OrganizationWorkspacesToolbar
        t={(key) =>
          (
            ({
              "common:ORG_WORKSPACES_TAB_ACTIVE": "Active",
              "common:ORG_WORKSPACES_TAB_ARCHIVED": "Archived",
              "common:ORG_WORKSPACES_SEARCH_PLACEHOLDER": "Search workspaces",
              "common:CLEAR": "Clear",
            }) as const
          )[
            key as
              | "common:ORG_WORKSPACES_TAB_ACTIVE"
              | "common:ORG_WORKSPACES_TAB_ARCHIVED"
              | "common:ORG_WORKSPACES_SEARCH_PLACEHOLDER"
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
        labels={{
          columns: "Columns",
          density: "Density",
          compact: "Compact",
          medium: "Medium",
          comfortable: "Comfortable",
          wrapHeaders: "Wrap headers",
          reset: "Reset",
          refresh: "Refresh",
          resetColumns: "Reset columns",
          resetColumnSizes: "Reset column sizes",
          resetColumnOrder: "Reset column order",
          clearSelection: "Clear selection",
          viewOptions: "View options",
          showHideColumns: "Show/hide columns",
        }}
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
        labels={{
          columns: "列配置",
          density: "密度",
          compact: "紧凑",
          medium: "标准",
          comfortable: "宽松",
          wrapHeaders: "标题换行",
          reset: "重置",
          refresh: "刷新",
          resetColumns: "重置列",
          resetColumnSizes: "重置列宽",
          resetColumnOrder: "重置列顺序",
          clearSelection: "清空选择",
          viewOptions: "显示选项",
          showHideColumns: "显示/隐藏列",
        }}
      />,
    );

    const toolbar = getToolbarFromTablist();
    expect(toolbar).toHaveClass("items-center");
    expect(toolbar).not.toHaveClass("items-start");
  });
});
