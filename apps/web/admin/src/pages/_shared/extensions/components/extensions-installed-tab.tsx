import { Button, Pagination } from "antd";
import { MoreVertical } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ContentGuard } from "@/components/common/content-guard";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { ExtensionCard } from "./extension-card";
import type { InstalledExtensionItem } from "../types";

type ExtensionMenuItem = {
  key: string;
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  onClick?: () => void;
  type?: "divider";
};

type ExtensionsInstalledTabProps = {
  items: InstalledExtensionItem[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  buildConfigureHref: (extension: InstalledExtensionItem) => string | null;
  buildMenuItems: (extension: InstalledExtensionItem) => ExtensionMenuItem[];
  isEmpty: boolean;
};

export function ExtensionsInstalledTab({
  items,
  total,
  page,
  pageSize,
  onPageChange,
  buildConfigureHref,
  buildMenuItems,
  isEmpty,
}: ExtensionsInstalledTabProps) {
  const { t } = useTranslation(["plugin", "common"]);

  if (isEmpty) {
    return (
      <ContentGuard
        loading={false}
        empty
        emptyTitle={t("common:EMPTY_TITLE")}
        emptyDescription={t("plugin:PLUGIN_CENTER_EMPTY")}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((p) => (
          <ExtensionCard
            key={p.pluginId}
            extension={p}
            href={buildConfigureHref(p)}
            installed
            actions={
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="text" size="small" icon={<MoreVertical className="size-3.5" />} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {buildMenuItems(p).map((item) =>
                    item.type === "divider" ? (
                      <DropdownMenuSeparator key="divider" />
                    ) : (
                      <DropdownMenuItem
                        key={item.key}
                        onSelect={item.onClick}
                        variant={item.danger ? "destructive" : undefined}
                      >
                        {item.icon}
                        {item.label}
                      </DropdownMenuItem>
                    ),
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            }
          />
        ))}
      </div>

      {total > pageSize ? (
        <div className="mt-6 flex justify-end">
          <Pagination
            current={page}
            pageSize={pageSize}
            total={total}
            onChange={onPageChange}
            showSizeChanger={false}
            showTotal={(n) => t("plugin:PLUGIN_CENTER_PAGINATION_TOTAL", { total: n })}
          />
        </div>
      ) : null}
    </div>
  );
}
