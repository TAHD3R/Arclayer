import { useMemo, useState, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AdminSiderNav } from "@/components/layout/admin-side-nav/admin-sider-nav";
import { ForbiddenView } from "@/components/builtin/forbidden-page";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import { useCurrentUserProfile } from "@/hooks/use-current-user-profile";
import { cn } from "@arclayer/lib/utils";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@arclayer/ui/empty";
import { Input } from "@arclayer/ui/input";
import { SidebarProvider } from "@arclayer/ui/sidebar";

import {
  SYSTEM_SETTINGS_ITEMS,
  SYSTEM_SETTINGS_PAGES,
  buildSystemSettingsNavItems,
  getSystemSettingsPage,
  type SystemSettingsSearchItem,
} from "./system-settings-registry";

type SystemSettingsLayoutProps = {
  children: ReactNode;
};

type SearchResult =
  | {
      type: "page";
      page: (typeof SYSTEM_SETTINGS_PAGES)[number];
      title: string;
      description: string;
      terms: string;
    }
  | {
      type: "item";
      item: SystemSettingsSearchItem;
      title: string;
      description: string;
      pageTitle: string;
      terms: string;
    };

function normalizeSearchTerm(value: string): string {
  return value.trim().toLowerCase();
}

function useSearchResults(query: string): SearchResult[] {
  const { t, i18n } = useTranslation(["settings"]);

  return useMemo(() => {
    const pages = SYSTEM_SETTINGS_PAGES.map<SearchResult>((page) => {
      const title = t(page.titleKey);
      const description = t(page.descriptionKey);
      return {
        type: "page",
        page,
        title,
        description,
        terms: [title, description, t(page.labelKey), page.key].join(" ").toLowerCase(),
      };
    });
    const items = SYSTEM_SETTINGS_ITEMS.map<SearchResult>((item) => {
      const page = SYSTEM_SETTINGS_PAGES.find((candidate) => candidate.key === item.page);
      const title = t(item.titleKey);
      const description = t(item.descriptionKey);
      const pageTitle = page ? t(page.titleKey) : item.page;
      return {
        type: "item",
        item,
        title,
        description,
        pageTitle,
        terms: [title, description, pageTitle, item.page, item.id, ...(item.keywords ?? [])]
          .join(" ")
          .toLowerCase(),
      };
    });
    const term = normalizeSearchTerm(query);
    const all = [...pages, ...items];
    return term ? all.filter((result) => result.terms.includes(term)) : [];
  }, [i18n.language, i18n.resolvedLanguage, query, t]);
}

function SearchResults(props: { query: string; results: SearchResult[]; onClose: () => void }) {
  const { t } = useTranslation(["settings", "common"]);
  const navigate = useNavigate();

  if (!props.query.trim()) return null;

  if (props.results.length === 0) {
    return (
      <Empty className="gap-3 py-5">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Search className="size-5" />
          </EmptyMedia>
          <EmptyTitle className="text-title3">
            {t("settings:SETTINGS_SYSTEM_SEARCH_EMPTY_TITLE")}
          </EmptyTitle>
          <EmptyDescription className="text-footnote">
            {t("settings:SETTINGS_SYSTEM_SEARCH_EMPTY_DESC")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="max-h-[52vh] overflow-y-auto py-1">
      {props.results.map((result) => {
        const target =
          result.type === "page"
            ? result.page.to
            : (`/system/settings/${result.item.page}#${result.item.id}` as const);
        return (
          <button
            key={result.type === "page" ? `page:${result.page.key}` : `item:${result.item.id}`}
            type="button"
            className={cn(
              "flex w-full min-w-0 flex-col gap-1 px-3 py-2.5 text-left",
              "transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
            )}
            onClick={() => {
              props.onClose();
              void navigate({ to: target as never });
            }}
          >
            <span className="truncate text-callout font-semibold text-label-primary">
              {result.title}
            </span>
            <span className="line-clamp-2 text-footnote text-label-secondary">
              {result.type === "item" ? `${result.pageTitle} · ` : null}
              {result.description}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function SystemSettingsLayout(props: SystemSettingsLayoutProps) {
  const { t } = useTranslation(["settings"]);
  const [query, setQuery] = useState("");
  const currentUserQuery = useCurrentUserProfile();
  const pathname = useRouterState({
    select: (state) => state.resolvedLocation?.pathname ?? state.location.pathname,
  });
  const activePage = getSystemSettingsPage(pathname);
  const navItems = useMemo(() => buildSystemSettingsNavItems(), []);
  const searchResults = useSearchResults(query);

  if (currentUserQuery.isLoading && !currentUserQuery.profile) {
    return (
      <DefaultPage title={t("settings:SETTINGS_SYSTEM_TITLE")} showFavoriteToggle={false}>
        <ContentGuard loading loadingVariant="form" />
      </DefaultPage>
    );
  }

  if (currentUserQuery.isError) {
    return (
      <DefaultPage title={t("settings:SETTINGS_SYSTEM_TITLE")} showFavoriteToggle={false}>
        <ContentGuard
          loading={false}
          error={currentUserQuery.error}
          onRetry={() => void currentUserQuery.refetch()}
        />
      </DefaultPage>
    );
  }

  if (!currentUserQuery.isSuperAdmin) {
    return <ForbiddenView variant="admin" />;
  }

  return (
    <DefaultPage
      title={t(activePage.titleKey)}
      description={t(activePage.descriptionKey)}
      showFavoriteToggle={false}
      headerBehavior="sticky"
      contentContainerClassName="min-h-full [--page-sticky-header-height:6rem]"
    >
      <div className="flex min-h-full w-full gap-8">
        <aside className="hidden min-h-full w-72 shrink-0 lg:block">
          <div className="sticky top-[var(--page-sticky-header-height,6rem)] flex max-h-[calc(100vh-var(--page-sticky-header-height,6rem)-1rem)] min-h-0 w-full flex-col gap-4 overflow-y-auto pb-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-label-tertiary" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("settings:SETTINGS_SYSTEM_SEARCH_PLACEHOLDER")}
                className="pl-9"
                autoComplete="off"
              />
            </div>
            <SearchResults query={query} results={searchResults} onClose={() => setQuery("")} />
            {!query.trim() ? (
              <SidebarProvider
                open
                onOpenChange={() => undefined}
                widthPx={288}
                className="!min-h-0 w-full"
              >
                <AdminSiderNav
                  items={navItems}
                  showFavorites={false}
                  className="m-0 w-full [&_[data-active]]:w-full [&_[data-sidebar=menu-button]]:w-full [&_[data-sidebar=menu-item]]:w-full [&_[data-sidebar=menu]]:w-full"
                  pathnameOverride={pathname}
                />
              </SidebarProvider>
            ) : null}
          </div>
        </aside>

        <div className="min-w-0 flex-1">{props.children}</div>
      </div>
    </DefaultPage>
  );
}
