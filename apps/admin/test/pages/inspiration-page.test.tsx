import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentType } from "react";
import { describe, expect, it, vi } from "vitest";

import { InspirationPage } from "@/pages/inspiration/page";
import { ChromeTabsProvider } from "@arclayer/ui/chrome-tabs";

vi.mock("@/components/common/admin-masonry-grid", async () => {
  return {
    AdminMasonryGrid: ({
      items,
      render: Render,
    }: {
      items: Array<{ key: string }>;
      render: ComponentType<{ data: { key: string }; index: number; width: number }>;
    }) => (
      <div data-testid="admin-masonry-grid">
        {items.map((item, index) => (
          <Render key={item.key} data={item} index={index} width={260} />
        ))}
      </div>
    ),
    getAdminMasonryDatasetKey: (baseKey: string, orderedIds: readonly string[]) =>
      `${baseKey}:${orderedIds.join("|")}`,
  };
});

const labels: Record<string, string> = {
  "ai:AI_CHAT_HOME_INSPIRATION_CATEGORY_ALL": "全部",
  "ai:AI_CHAT_HOME_INSPIRATION_CATEGORY_LANDING": "落地页",
  "ai:AI_CHAT_HOME_INSPIRATION_CATEGORY_COMMERCE": "电商",
  "ai:AI_CHAT_HOME_INSPIRATION_CATEGORY_CONTENT": "内容",
  "ai:AI_CHAT_HOME_INSPIRATION_CATEGORY_PORTFOLIO": "作品集",
  "ai:AI_CHAT_HOME_INSPIRATION_CATEGORY_DOCS": "文档",
  "ai:AI_CHAT_HOME_INSPIRATION_CATEGORY_EVENTS": "活动",
  "ai:AI_CHAT_HOME_INSPIRATION_CATEGORY_REAL_ESTATE": "地产",
  "ai:AI_CHAT_HOME_INSPIRATION_TEMPLATE_EDITORIAL_STUDIO_NAME": "Editorial Studio",
  "ai:AI_CHAT_HOME_INSPIRATION_TEMPLATE_EDITORIAL_STUDIO_DESC": "为品牌观点设计的首页。",
  "ai:AI_CHAT_HOME_INSPIRATION_TEMPLATE_SAAS_LAUNCH_NAME": "SaaS Launch Desk",
  "ai:AI_CHAT_HOME_INSPIRATION_TEMPLATE_SAAS_LAUNCH_DESC": "面向 B2B 产品发布。",
  "ai:AI_CHAT_HOME_INSPIRATION_TEMPLATE_ARCHITECTURE_INDEX_NAME": "Architecture Index",
  "ai:AI_CHAT_HOME_INSPIRATION_TEMPLATE_ARCHITECTURE_INDEX_DESC": "适合建筑事务所。",
  "ai:AI_CHAT_HOME_INSPIRATION_TEMPLATE_HOSPITALITY_ROOM_NAME": "Hospitality Room Book",
  "ai:AI_CHAT_HOME_INSPIRATION_TEMPLATE_HOSPITALITY_ROOM_DESC": "适合酒店和民宿。",
  "ai:AI_CHAT_HOME_INSPIRATION_TEMPLATE_WORKSPACE_HUB_NAME": "Workspace Hub",
  "ai:AI_CHAT_HOME_INSPIRATION_TEMPLATE_WORKSPACE_HUB_DESC": "组织服务和案例。",
  "ai:AI_CHAT_HOME_INSPIRATION_TEMPLATE_COMMERCE_ATELIER_NAME": "Commerce Atelier",
  "ai:AI_CHAT_HOME_INSPIRATION_TEMPLATE_COMMERCE_ATELIER_DESC": "适合设计师品牌。",
  "ai:AI_CHAT_HOME_INSPIRATION_TEMPLATE_AGENCY_REPORT_NAME": "Agency Report",
  "ai:AI_CHAT_HOME_INSPIRATION_TEMPLATE_AGENCY_REPORT_DESC": "展示洞察与方法论。",
  "ai:AI_CHAT_HOME_INSPIRATION_TEMPLATE_TRAVEL_JOURNAL_NAME": "Travel Journal",
  "ai:AI_CHAT_HOME_INSPIRATION_TEMPLATE_TRAVEL_JOURNAL_DESC": "沉浸式游记结构。",
  "ai:AI_CHAT_HOME_INSPIRATION_TEMPLATE_CITY_EVENTS_NAME": "City Events Board",
  "ai:AI_CHAT_HOME_INSPIRATION_TEMPLATE_CITY_EVENTS_DESC": "组织活动日程。",
  "ai:AI_CHAT_HOME_INSPIRATION_TEMPLATE_REAL_ESTATE_NAME": "Real Estate Showcase",
  "ai:AI_CHAT_HOME_INSPIRATION_TEMPLATE_REAL_ESTATE_DESC": "承载地产项目。",
  "ai:AI_CHAT_INSPIRATION_PAGE_TITLE": "灵感发现",
  "ai:AI_CHAT_INSPIRATION_FEATURED_LABEL": "精选模板",
  "ai:AI_CHAT_INSPIRATION_CATEGORY_LABEL": "分类",
  "ai:AI_CHAT_INSPIRATION_FORMAT_LABEL": "格式",
  "ai:AI_CHAT_INSPIRATION_FORMAT_VALUE": "Site Builder 模板",
  "ai:AI_CHAT_INSPIRATION_SEARCH_PLACEHOLDER": "搜索模板名称、场景或分类",
  "ai:AI_CHAT_INSPIRATION_FILTER_TITLE": "筛选模板",
  "ai:AI_CHAT_INSPIRATION_FILTER_CATEGORY": "模板分类",
  "ai:AI_CHAT_INSPIRATION_STATS_LABEL": "灵感发现统计",
  "ai:AI_CHAT_INSPIRATION_VISIBLE_COUNT_LABEL": "当前显示",
  "ai:AI_CHAT_INSPIRATION_TOTAL_COUNT_LABEL": "模板总数",
  "ai:AI_CHAT_INSPIRATION_CATALOG_TITLE": "模板目录",
  "ai:AI_CHAT_INSPIRATION_CATALOG_DESC": "按站点目标筛选模板。",
  "ai:AI_CHAT_INSPIRATION_TEMPLATE_EDITORIAL_STUDIO_DETAIL": "适合内容站点的编辑型首页。",
  "ai:AI_CHAT_INSPIRATION_TEMPLATE_SAAS_LAUNCH_DETAIL": "适合 B2B SaaS 发布页的结构。",
  "ai:AI_CHAT_INSPIRATION_TEMPLATE_COMMERCE_ATELIER_DETAIL": "适合设计师品牌的电商结构。",
  "common:CLEAR": "清除",
  "common:FILTER_OPERATOR_IS": "为",
  "common:VIEW_MODE_CARD": "卡片视图",
  "common:VIEW_MODE_TABLE": "列表视图",
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => labels[key] ?? key,
  }),
}));

function renderInspirationPage() {
  return render(
    <ChromeTabsProvider
      labels={{
        scrollLeftAriaLabel: "向左滚动",
        scrollRightAriaLabel: "向右滚动",
      }}
    >
      <InspirationPage />
    </ChromeTabsProvider>,
  );
}

describe("InspirationPage", () => {
  it("renders the full inspiration catalog with sticky chrome tabs", () => {
    const { container } = renderInspirationPage();

    expect(screen.getByText("灵感发现")).toBeInTheDocument();
    expect(screen.getByText("精选模板")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "全部" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "落地页" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("搜索模板名称、场景或分类")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "筛选模板" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "卡片视图, 列表视图" })).toBeInTheDocument();
    expect(screen.getByTestId("admin-masonry-grid")).toBeInTheDocument();
    expect(screen.queryByText("当前显示")).not.toBeInTheDocument();
    expect(screen.queryByText("模板总数")).not.toBeInTheDocument();
    expect(screen.queryByText("按站点目标筛选模板。")).not.toBeInTheDocument();

    const tabs = container.querySelector(".sticky.top-0.bg-background");
    expect(tabs).toHaveClass("sticky", "top-0", "bg-background");
  });

  it("updates the featured panel when a template card is selected", async () => {
    const user = userEvent.setup();
    renderInspirationPage();

    await user.click(screen.getByRole("button", { name: /SaaS Launch Desk/ }));

    expect(screen.getAllByText("SaaS Launch Desk")).toHaveLength(2);
    expect(screen.getByText("适合 B2B SaaS 发布页的结构。")).toBeInTheDocument();
  });

  it("filters templates by site-builder category and keeps the featured panel in that category", async () => {
    const user = userEvent.setup();
    renderInspirationPage();

    await user.click(screen.getByRole("tab", { name: /电商/ }));

    await waitFor(() => expect(screen.getAllByText("Commerce Atelier")).toHaveLength(2));
    expect(screen.getByText("适合设计师品牌的电商结构。")).toBeInTheDocument();
    expect(screen.queryByText("SaaS Launch Desk")).not.toBeInTheDocument();
  });

  it("switches the catalog between masonry cards and list view", async () => {
    const user = userEvent.setup();
    renderInspirationPage();

    expect(screen.getByTestId("admin-masonry-grid")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "列表视图" }));

    expect(screen.queryByTestId("admin-masonry-grid")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Editorial Studio 内容/ })).toBeInTheDocument();
  });

  it("filters templates from the catalog search field", async () => {
    const user = userEvent.setup();
    renderInspirationPage();

    await user.type(screen.getByPlaceholderText("搜索模板名称、场景或分类"), "commerce");

    await waitFor(() => expect(screen.getAllByText("Commerce Atelier")).toHaveLength(2));
    expect(screen.queryByText("Editorial Studio")).not.toBeInTheDocument();
  });
});
