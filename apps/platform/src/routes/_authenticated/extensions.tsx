import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { ChromeTabs, ChromeTabsList, ChromeTabsTrigger } from "@arclayer/ui/chrome-tabs";

const tabs = [
  { value: "installed", to: "/extensions/installed", label: "EXTENSIONS_INSTALLED" },
  { value: "catalog", to: "/extensions/catalog", label: "EXTENSIONS_CATALOG" },
  { value: "connections", to: "/extensions/connections", label: "EXTENSIONS_CONNECTIONS" },
  { value: "history", to: "/extensions/history", label: "EXTENSIONS_HISTORY" },
] as const;

function ExtensionsShell() {
  const { t } = useTranslation("navigation");
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const active = tabs.find((tab) => pathname.startsWith(tab.to))?.value ?? "installed";
  return (
    <ChromeTabs value={active}>
      <div className="border-b px-5 pt-5 md:px-8">
        <ChromeTabsList>
          {tabs.map((tab) => (
            <ChromeTabsTrigger asChild key={tab.value} value={tab.value}>
              <Link to={tab.to}>{t(tab.label)}</Link>
            </ChromeTabsTrigger>
          ))}
        </ChromeTabsList>
      </div>
      <Outlet />
    </ChromeTabs>
  );
}

export const Route = createFileRoute("/_authenticated/extensions")({ component: ExtensionsShell });
