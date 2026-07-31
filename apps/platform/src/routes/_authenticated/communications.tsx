import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { ChromeTabs, ChromeTabsList, ChromeTabsTrigger } from "@arclayer/ui/chrome-tabs";

const tabs = [
  { value: "feedback", to: "/communications/feedback", label: "COMMUNICATIONS_FEEDBACK" },
  { value: "campaigns", to: "/communications/campaigns", label: "COMMUNICATIONS_CAMPAIGNS" },
  { value: "templates", to: "/communications/templates", label: "COMMUNICATIONS_TEMPLATES" },
  { value: "email", to: "/communications/email", label: "COMMUNICATIONS_EMAIL" },
] as const;

function CommunicationsShell() {
  const { t } = useTranslation("navigation");
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const active = tabs.find((tab) => pathname.startsWith(tab.to))?.value ?? "feedback";
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

export const Route = createFileRoute("/_authenticated/communications")({
  component: CommunicationsShell,
});
