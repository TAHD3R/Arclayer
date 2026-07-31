import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { ChromeTabs, ChromeTabsList, ChromeTabsTrigger } from "@arclayer/ui/chrome-tabs";

const tabs = [
  { value: "issues", to: "/site-delivery/issues", label: "SITE_DELIVERY_ISSUES" },
  { value: "domains", to: "/site-delivery/domains", label: "SITE_DELIVERY_DOMAINS" },
  { value: "storage", to: "/site-delivery/storage", label: "SITE_DELIVERY_STORAGE" },
  { value: "rules", to: "/site-delivery/rules", label: "SITE_DELIVERY_RULES" },
] as const;

function SiteDeliveryShell() {
  const { t } = useTranslation("navigation");
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const active = tabs.find((tab) => pathname.startsWith(tab.to))?.value ?? "issues";
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

export const Route = createFileRoute("/_authenticated/site-delivery")({
  component: SiteDeliveryShell,
});
