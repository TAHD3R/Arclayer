import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { AdminNavItem } from "@/constants/admin-nav";
import { buildAdminNavCommandItems } from "@/lib/command/nav-command-items";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { SearchModal, type CommandItem } from "@/components/ui/search-modal";

export function AdminCommandMenuTrigger(props: { navItems: readonly AdminNavItem[] }) {
  const { t } = useTranslation("command");
  const navigate = useNavigate();
  const [isMacOS, setIsMacOS] = useState(false);

  useEffect(() => {
    const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
    const platform = String(nav.userAgentData?.platform || nav.platform || "").toLowerCase();
    setIsMacOS(platform.includes("mac"));
  }, []);

  const commandItems = useMemo<CommandItem[]>(() => {
    return buildAdminNavCommandItems(props.navItems, t, (to) => {
      void navigate({ to: to as never });
    });
  }, [navigate, props.navItems, t]);

  return (
    <SearchModal data={commandItems}>
      <button
        type="button"
        className={
          "group flex h-12 w-full items-center justify-between rounded-none border-0 bg-transparent px-4 " +
          "text-muted-foreground transition-colors duration-150 ease-out " +
          "hover:bg-primary hover:text-accent-foreground" +
          "data-[state=open]:bg-primary data-[state=open]:text-sidebar-accent-foreground " +
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0"
        }
        aria-label={t("CMD_SEARCH")}
      >
        <span className="truncate">{t("CMD_SEARCH")}</span>
        <span className="inline-flex items-center">
          <KbdGroup>
            <Kbd>{isMacOS ? "⌘" : "Ctrl"}</Kbd>
            <Kbd>K</Kbd>
          </KbdGroup>
        </span>
      </button>
    </SearchModal>
  );
}
