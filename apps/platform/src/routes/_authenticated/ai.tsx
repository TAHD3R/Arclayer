import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { ChromeTabs, ChromeTabsList, ChromeTabsTrigger } from "@arclayer/ui/chrome-tabs";

const tabs = [
  { value: "tasks", to: "/ai/tasks", label: "AI_TASKS" },
  { value: "providers", to: "/ai/providers", label: "AI_PROVIDERS" },
  { value: "assistants", to: "/ai/assistants", label: "AI_ASSISTANTS" },
] as const;

function AiShell() {
  const { t } = useTranslation("navigation");
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const active = tabs.find((tab) => pathname.startsWith(tab.to))?.value ?? "tasks";
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

export const Route = createFileRoute("/_authenticated/ai")({ component: AiShell });
