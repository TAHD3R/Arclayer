import type { ReactNode } from "react";

import { Input } from "antd";
import { Search } from "lucide-react";

import {
  ChromeTabs,
  ChromeTabsBar,
  ChromeTabsList,
  ChromeTabsTrigger,
} from "@celestial/ui/chrome-tabs";

import type { OrganizationWorkspacesTab, OrganizationWorkspacesTranslateFn } from "../types";

interface OrganizationWorkspacesToolbarProps {
  t: OrganizationWorkspacesTranslateFn;
  tab: OrganizationWorkspacesTab;
  onTabChange: (nextTab: OrganizationWorkspacesTab) => void;
  searchInput: string;
  onSearchInputChange: (nextValue: string) => void;
  showSearchInput?: boolean;
  children: ReactNode;
}

export function OrganizationWorkspacesToolbar(props: OrganizationWorkspacesToolbarProps) {
  const {
    t,
    tab,
    onTabChange,
    searchInput,
    onSearchInputChange,
    showSearchInput = true,
    children,
  } = props;

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
            {showSearchInput ? (
              <Input
                className="w-[240px] sm:w-[280px] md:w-[320px]"
                value={searchInput}
                onChange={(event) => onSearchInputChange(event.target.value)}
                placeholder={t("common:ORG_WORKSPACES_SEARCH_PLACEHOLDER")}
                allowClear
                variant="filled"
                prefix={<Search className="size-4 text-label-secondary" />}
              />
            ) : null}
          </div>
        }
      />

      {children}
    </ChromeTabs>
  );
}
