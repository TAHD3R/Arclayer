import type { ReactNode } from "react";

import { Input } from "antd";

import {
  ChromeTabs,
  ChromeTabsBar,
  ChromeTabsList,
  ChromeTabsTrigger,
} from "@/components/ui/chrome-tabs";

import type {
  OrganizationWorkspacesTab,
  OrganizationWorkspacesTranslateFn,
} from "./organization-workspaces-types";

interface OrganizationWorkspacesToolbarProps {
  t: OrganizationWorkspacesTranslateFn;
  tab: OrganizationWorkspacesTab;
  onTabChange: (nextTab: OrganizationWorkspacesTab) => void;
  searchInput: string;
  onSearchInputChange: (nextValue: string) => void;
  children: ReactNode;
}

export function OrganizationWorkspacesToolbar(props: OrganizationWorkspacesToolbarProps) {
  const { t, tab, onTabChange, searchInput, onSearchInputChange, children } = props;

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
          <Input.Search
            variant="borderless"
            className="w-[320px]"
            value={searchInput}
            onChange={(event) => onSearchInputChange(event.target.value)}
            placeholder={t("common:ORG_WORKSPACES_SEARCH_PLACEHOLDER")}
            allowClear
          />
        }
      />

      {children}
    </ChromeTabs>
  );
}
