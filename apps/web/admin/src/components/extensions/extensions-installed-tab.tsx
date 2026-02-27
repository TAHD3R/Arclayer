import type { MenuProps } from "antd";
import { Button, Dropdown, Pagination } from "antd";
import { MoreVertical } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ContentGuard } from "@/components/common/content-guard";

import { ExtensionCard } from "./extension-card";
import type { InstalledExtensionItem } from "./types";

type ExtensionsInstalledTabProps = {
  items: InstalledExtensionItem[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  buildConfigureHref: (extension: InstalledExtensionItem) => string | null;
  buildMenuItems: (extension: InstalledExtensionItem) => MenuProps["items"];
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
              <Dropdown trigger={["click"]} menu={{ items: buildMenuItems(p) }}>
                <Button type="text" size="small" icon={<MoreVertical className="size-3.5" />} />
              </Dropdown>
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
