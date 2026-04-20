import { MoreVertical } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { Button } from "@arclayer/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuIconItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";

import { ExtensionCard } from "./extension-card";
import type { ExtensionMenuItem, InstalledExtensionItem } from "../types";

type ExtensionsInstalledTabProps = {
  items: InstalledExtensionItem[];
  buildConfigureHref: (extension: InstalledExtensionItem) => string | null;
  buildMenuItems: (extension: InstalledExtensionItem) => ExtensionMenuItem[];
  isEmpty: boolean;
};

export function ExtensionsInstalledTab({
  items,
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
            key={p.capabilityId}
            extension={p}
            href={buildConfigureHref(p)}
            installed
            actions={
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm">
                    <MoreVertical className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {buildMenuItems(p).map((item) =>
                    item.type === "divider" ? (
                      <DropdownMenuSeparator key={item.key} />
                    ) : (
                      <DropdownMenuIconItem
                        key={item.key}
                        onSelect={item.onClick}
                        disabled={item.disabled}
                        variant={item.danger ? "destructive" : undefined}
                        icon={item.icon}
                      >
                        {item.label}
                      </DropdownMenuIconItem>
                    ),
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            }
          />
        ))}
      </div>
    </div>
  );
}
