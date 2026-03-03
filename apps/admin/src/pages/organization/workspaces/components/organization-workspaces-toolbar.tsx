import type { ReactNode } from "react";

import { Button as AntButton, Input, Space } from "antd";
import { LayoutGrid, List } from "lucide-react";

import {
  ChromeTabs,
  ChromeTabsBar,
  ChromeTabsList,
  ChromeTabsTrigger,
} from "@celestial/ui/chrome-tabs";

import type {
  OrganizationWorkspacesTab,
  OrganizationWorkspacesTranslateFn,
  OrganizationWorkspacesViewMode,
} from "../types";

interface OrganizationWorkspacesToolbarProps {
  t: OrganizationWorkspacesTranslateFn;
  tab: OrganizationWorkspacesTab;
  onTabChange: (nextTab: OrganizationWorkspacesTab) => void;
  searchInput: string;
  onSearchInputChange: (nextValue: string) => void;
  viewMode: OrganizationWorkspacesViewMode;
  onViewModeChange: (mode: OrganizationWorkspacesViewMode) => void;
  children: ReactNode;
}

export function OrganizationWorkspacesToolbar(props: OrganizationWorkspacesToolbarProps) {
  const {
    t,
    tab,
    onTabChange,
    searchInput,
    onSearchInputChange,
    viewMode,
    onViewModeChange,
    children,
  } = props;

  return (
    <ChromeTabs
      value={tab}
      onValueChange={(value) => onTabChange(value === "archived" ? "archived" : "active")}
    >
      <ChromeTabsBar
        left={
          <ChromeTabsList>
            <ChromeTabsTrigger value="active">
              {t("common:ORG_WORKSPACES_TAB_ACTIVE")}
            </ChromeTabsTrigger>
            <ChromeTabsTrigger value="archived">
              {t("common:ORG_WORKSPACES_TAB_ARCHIVED")}
            </ChromeTabsTrigger>
          </ChromeTabsList>
        }
        right={
          <div className="flex items-center gap-2">
            <Input.Search
              variant="borderless"
              className="w-[320px]"
              value={searchInput}
              onChange={(event) => onSearchInputChange(event.target.value)}
              placeholder={t("common:ORG_WORKSPACES_SEARCH_PLACEHOLDER")}
              allowClear
            />
            <Space.Compact>
              <AntButton
                type={viewMode === "card" ? "primary" : "text"}
                icon={<LayoutGrid className="size-4" />}
                onClick={() => onViewModeChange("card")}
                autoInsertSpace={false}
              />
              <AntButton
                type={viewMode === "table" ? "primary" : "text"}
                icon={<List className="size-4" />}
                onClick={() => onViewModeChange("table")}
                autoInsertSpace={false}
              />
            </Space.Compact>
          </div>
        }
      />

      {children}
    </ChromeTabs>
  );
}
