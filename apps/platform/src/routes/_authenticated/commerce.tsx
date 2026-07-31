import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { ChromeTabs, ChromeTabsList, ChromeTabsTrigger } from "@arclayer/ui/chrome-tabs";
import { createFileRoute } from "@tanstack/react-router";

const tabs = [
  { value: "subscriptions", to: "/commerce/subscriptions", label: "COMMERCE_SUBSCRIPTIONS" },
  { value: "plans", to: "/commerce/plans", label: "COMMERCE_PLANS" },
] as const;

function CommerceShell() {
  const { t } = useTranslation("navigation");
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const active = tabs.find((tab) => pathname.startsWith(tab.to))?.value ?? "subscriptions";
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

export const Route = createFileRoute("/_authenticated/commerce")({ component: CommerceShell });
