import type { ReactNode } from "react";

import { Input } from "antd";
import { Search } from "lucide-react";

import {
  ChromeTabs,
  ChromeTabsBar,
  ChromeTabsList,
  ChromeTabsTrigger,
} from "@celestial/ui/chrome-tabs";
import { useMediaQuery } from "@celestial/hooks/use-media-query";

import type {
  OrganizationWorkspacesTab,
  OrganizationWorkspacesTranslateFn,
  OrganizationWorkspacesViewMode,
} from "../types";
import { WorkspacesViewModeToggle } from "./workspaces-view-mode-toggle";

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

  const showViewModeText = useMediaQuery("(min-width: 768px)");

  return (
    <ChromeTabs
      value={tab}
      onValueChange={(value) => onTabChange(value === "archived" ? "archived" : "active")}
    >
      <ChromeTabsBar
        className="flex-wrap gap-y-2"
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
          <div className="flex w-full flex-wrap items-center justify-end gap-2 md:w-auto">
            <WorkspacesViewModeToggle
              t={t}
              value={viewMode}
              onChange={onViewModeChange}
              display={showViewModeText ? "icon+text" : "icon"}
            />
            <Input
              className="w-[240px] sm:w-[280px] md:w-[320px]"
              value={searchInput}
              onChange={(event) => onSearchInputChange(event.target.value)}
              placeholder={t("common:ORG_WORKSPACES_SEARCH_PLACEHOLDER")}
              allowClear
              variant="filled"
              prefix={<Search className="size-4 text-label-secondary" />}
            />
          </div>
        }
      />

      {children}
    </ChromeTabs>
  );
}
