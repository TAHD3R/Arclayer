import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ChevronRight,
  Code2,
  Database,
  Search,
  Server,
  Settings2,
  SlidersHorizontal,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { DefaultPage } from "@/layouts/page-shell/default-page";
import { ProjectApiKeysSettingsPage } from "@/pages/projects/settings/api-keys/page";
import { ProjectDatabasesPage } from "@/pages/projects/settings/databases/page";
import { ProjectEnvironmentsPage } from "@/pages/projects/settings/environments/page";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@arclayer/ui/sheet";
import { cn } from "@arclayer/lib/utils";

import { ProjectGeneralSettingsTab } from "./project-general-settings-tab";

type ProjectSettingsTabKey = "general" | "api" | "environments" | "databases";

type ProjectSettingsPageProps = {
  activeTab: ProjectSettingsTabKey;
  projectId: string;
};

function resolveProjectSettingsTabNavigation(projectId: string, tab: ProjectSettingsTabKey) {
  const params = { projectId };
  switch (tab) {
    case "api":
      return { to: "/projects/$projectId/settings/api" as const, params };
    case "environments":
      return { to: "/projects/$projectId/settings/environments" as const, params };
    case "databases":
      return { to: "/projects/$projectId/settings/databases" as const, params };
    case "general":
    default:
      return { to: "/projects/$projectId/settings/general" as const, params };
  }
}

function buildProjectSettingsNavItems(): Array<{
  key: string;
  tab: ProjectSettingsTabKey;
  labelKey: string;
  descriptionKey: string;
  keywords: readonly string[];
  icon: typeof Settings2;
}> {
  return [
    {
      key: "project.general",
      tab: "general",
      labelKey: "account:SETTINGS_NAV_PROJECT_GENERAL",
      descriptionKey: "account:SETTINGS_PROJECT_DESC",
      keywords: ["identity", "slug", "description"],
      icon: Settings2,
    },
    {
      key: "project.api",
      tab: "api",
      labelKey: "account:SETTINGS_NAV_PROJECT_API",
      descriptionKey: "account:SETTINGS_NAV_PROJECT_API_DESC",
      keywords: ["api", "keys", "tokens", "integration"],
      icon: Code2,
    },
    {
      key: "project.environments",
      tab: "environments",
      labelKey: "account:SETTINGS_PROJECT_ENVIRONMENTS_TITLE",
      descriptionKey: "account:SETTINGS_PROJECT_ENVIRONMENTS_DESC",
      keywords: ["environment", "preview", "production", "runtime"],
      icon: Server,
    },
    {
      key: "project.databases",
      tab: "databases",
      labelKey: "account:SETTINGS_PROJECT_DATABASES_TITLE",
      descriptionKey: "account:SETTINGS_PROJECT_DATABASES_DESC",
      keywords: ["database", "postgres", "credentials", "storage"],
      icon: Database,
    },
  ];
}

type ProjectSettingsNavItem = ReturnType<typeof buildProjectSettingsNavItems>[number];

function normalizeSettingsSearchTerm(value: string): string {
  return value.trim().toLowerCase();
}

function useProjectSettingsNavSearch(items: ProjectSettingsNavItem[], query: string) {
  const { t, i18n } = useTranslation(["account"]);

  return useMemo(() => {
    const term = normalizeSettingsSearchTerm(query);
    if (!term) return items;
    return items.filter((item) =>
      [t(item.labelKey), t(item.descriptionKey), item.tab, item.key, ...item.keywords]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [i18n.language, i18n.resolvedLanguage, items, query, t]);
}

function ProjectSettingsSearch(props: {
  id: string;
  query: string;
  onQueryChange: (query: string) => void;
}) {
  const { t } = useTranslation(["account"]);
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-label-tertiary" />
      <Input
        id={props.id}
        name={props.id}
        value={props.query}
        onChange={(event) => props.onQueryChange(event.target.value)}
        placeholder={t("account:SETTINGS_PROJECT_SEARCH_PLACEHOLDER")}
        className="pl-9"
        autoComplete="off"
      />
    </div>
  );
}

function ProjectSettingsSideNav(props: {
  activeTab: ProjectSettingsTabKey;
  items: readonly ProjectSettingsNavItem[];
  onSelect: (tab: ProjectSettingsTabKey) => void;
}) {
  const { t } = useTranslation(["account"]);
  if (props.items.length === 0) {
    return (
      <div className="rounded-md border border-border bg-muted/20 px-3 py-4 text-footnote text-label-secondary">
        {t("account:SETTINGS_PROJECT_SEARCH_EMPTY")}
      </div>
    );
  }

  return (
    <nav aria-label={t("account:SETTINGS_PROJECT_TITLE")}>
      <ul className="flex flex-col gap-1">
        {props.items.map((item) => {
          const Icon = item.icon;
          const active = item.tab === props.activeTab;
          return (
            <li key={item.key}>
              <button
                type="button"
                data-active={active ? "true" : "false"}
                className={cn(
                  "flex h-9 w-full min-w-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-callout transition-colors",
                  "text-label-secondary hover:bg-accent hover:text-label-primary",
                  active && "bg-accent font-semibold text-label-primary",
                )}
                onClick={() => props.onSelect(item.tab)}
              >
                <Icon className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{t(item.labelKey)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function ProjectSettingsMobileNav(props: {
  activeTab: ProjectSettingsTabKey;
  items: readonly ProjectSettingsNavItem[];
  query: string;
  onQueryChange: (query: string) => void;
  onSelect: (tab: ProjectSettingsTabKey) => void;
}) {
  const { t } = useTranslation(["account", "common"]);
  const [open, setOpen] = useState(false);
  const activeItem = props.items.find((item) => item.tab === props.activeTab) ?? props.items[0];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-auto w-full !justify-between gap-3 px-3 py-2.5 text-left lg:hidden"
          aria-label={t("account:SETTINGS_PROJECT_NAVIGATION_ACTION")}
        >
          <span className="flex min-w-0 items-center gap-3">
            <SlidersHorizontal aria-hidden="true" className="size-4 shrink-0" />
            <span className="min-w-0">
              <span className="block truncate text-headline font-medium text-label-primary">
                {activeItem ? t(activeItem.labelKey) : t("account:SETTINGS_PROJECT_TITLE")}
              </span>
              <span className="block text-footnote font-normal text-label-secondary">
                {t("account:SETTINGS_PROJECT_NAVIGATION_HINT")}
              </span>
            </span>
          </span>
          <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-label-tertiary" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-[min(22rem,calc(100vw-1rem))] gap-0"
        closeButtonLabel={t("common:CLOSE")}
      >
        <SheetHeader>
          <SheetTitle>{t("account:SETTINGS_PROJECT_TITLE")}</SheetTitle>
          <SheetDescription>{t("account:SETTINGS_PROJECT_NAVIGATION_DESC")}</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <ProjectSettingsSearch
            id="project-settings-mobile-search"
            query={props.query}
            onQueryChange={props.onQueryChange}
          />
          <div className="mt-4">
            <ProjectSettingsSideNav
              activeTab={props.activeTab}
              items={props.items}
              onSelect={(tab) => {
                setOpen(false);
                props.onSelect(tab);
              }}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function ProjectSettingsPage(props: ProjectSettingsPageProps) {
  const { activeTab, projectId } = props;
  const { t } = useTranslation(["account"]);
  const navigate = useNavigate();
  const navItems = useMemo(() => buildProjectSettingsNavItems(), []);
  const [query, setQuery] = useState("");
  const filteredNavItems = useProjectSettingsNavSearch(navItems, query);
  const selectTab = (nextTab: ProjectSettingsTabKey) => {
    setQuery("");
    void navigate(resolveProjectSettingsTabNavigation(projectId, nextTab));
  };

  const content = (() => {
    switch (activeTab) {
      case "api":
        return <ProjectApiKeysSettingsPage projectId={projectId} embedded />;
      case "environments":
        return <ProjectEnvironmentsPage projectId={projectId} embedded />;
      case "databases":
        return <ProjectDatabasesPage projectId={projectId} embedded />;
      case "general":
      default:
        return <ProjectGeneralSettingsTab projectId={projectId} />;
    }
  })();

  return (
    <DefaultPage
      title={t("account:SETTINGS_PROJECT_TITLE")}
      description={t("account:SETTINGS_PROJECT_DESC")}
      headerBehavior="sticky"
      contentContainerClassName="[--page-sticky-header-height:6rem]"
    >
      <div className="w-full">
        <ProjectSettingsMobileNav
          activeTab={activeTab}
          items={filteredNavItems}
          query={query}
          onQueryChange={setQuery}
          onSelect={selectTab}
        />

        <div className="mt-6 flex w-full gap-8 lg:mt-0">
          <aside className="hidden w-72 shrink-0 lg:block">
            <div className="sticky top-[var(--page-sticky-header-height,6rem)] flex max-h-[calc(100vh-var(--page-sticky-header-height,6rem)-1rem)] min-h-0 w-full flex-col gap-4 overflow-y-auto pb-4">
              <ProjectSettingsSearch
                id="project-settings-search"
                query={query}
                onQueryChange={setQuery}
              />
              <ProjectSettingsSideNav
                items={filteredNavItems}
                activeTab={activeTab}
                onSelect={selectTab}
              />
            </div>
          </aside>

          <div className="min-w-0 flex-1">{content}</div>
        </div>
      </div>
    </DefaultPage>
  );
}
