import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useIsMobile } from "@arclayer/hooks/use-is-mobile";
import { useTranslation } from "react-i18next";

import {
  AdminMasonryGrid,
  getAdminMasonryDatasetKey,
  resolveAdminMasonryScrollViewport,
} from "@/components/common/admin-masonry-grid";
import {
  filterInspirationTemplates,
  INSPIRATION_TEMPLATE_ITEM_HEIGHT_ESTIMATE,
  SITE_BUILDER_CATEGORIES,
  type InspirationTemplate,
  type SiteBuilderCategory,
} from "@/pages/inspiration/inspiration-catalog";
import { GLOBAL_ROUTE_PATHS } from "@/lib/routing/global-routes";
import { cn } from "@arclayer/lib/utils";
import { ChromeTabs, ChromeTabsList, ChromeTabsTrigger } from "@arclayer/ui/chrome-tabs";

import { HomeSectionHeader } from "./home-section-header";

const INSPIRATION_TITLE_ID = "home-inspiration-title";
const HOME_INSPIRATION_DESKTOP_COLUMN_COUNT = 4;
const HOME_INSPIRATION_MOBILE_COLUMN_COUNT = 2;

function useStickyTabsState() {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === "undefined") return undefined;
    const viewport = resolveAdminMasonryScrollViewport(sentinel);
    const root = viewport.kind === "element" ? viewport.node : null;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        const rootTop = entry.rootBounds?.top ?? 0;
        setStuck(!entry.isIntersecting && entry.boundingClientRect.top <= rootTop);
      },
      { root, threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return { sentinelRef, stuck };
}

export function HomeInspirationSection() {
  const { t } = useTranslation(["ai"]);
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [activeCategory, setActiveCategory] = useState<SiteBuilderCategory>("all");
  const { sentinelRef, stuck: tabsStuck } = useStickyTabsState();
  const templates = useMemo(() => filterInspirationTemplates(activeCategory), [activeCategory]);
  const datasetKey = useMemo(
    () =>
      getAdminMasonryDatasetKey(
        `home-inspiration:${activeCategory}`,
        templates.map((template) => template.key),
      ),
    [activeCategory, templates],
  );

  return (
    <section className="mx-auto w-full max-w-[94rem]" aria-labelledby={INSPIRATION_TITLE_ID}>
      <HomeSectionHeader
        title={t("ai:AI_CHAT_HOME_INSPIRATION_TITLE")}
        actionLabel={t("ai:AI_CHAT_HOME_INSPIRATION_SEE_ALL")}
        titleId={INSPIRATION_TITLE_ID}
        testId="home-inspiration-section"
        onAction={() => void navigate({ to: GLOBAL_ROUTE_PATHS.inspiration as never })}
      />
      <div ref={sentinelRef} className="h-px w-full" aria-hidden="true" />
      <ChromeTabs
        data-testid="home-inspiration-tabs"
        value={activeCategory}
        onValueChange={(value) => setActiveCategory(value as SiteBuilderCategory)}
        data-stuck={tabsStuck ? "true" : "false"}
        className={cn(
          "sticky top-0 z-20 mb-4 min-w-0 transition-[background-color,box-shadow] duration-150",
          tabsStuck &&
            "bg-background shadow-[0_10px_24px_-20px_color-mix(in_oklab,var(--color-foreground)_32%,transparent)]",
        )}
      >
        <ChromeTabsList wrapperClassName="block w-full min-w-0">
          {SITE_BUILDER_CATEGORIES.map((category) => (
            <ChromeTabsTrigger key={category.key} value={category.key}>
              {t(`ai:${category.labelKey}`)}
            </ChromeTabsTrigger>
          ))}
        </ChromeTabsList>
      </ChromeTabs>
      <AdminMasonryGrid
        items={templates}
        datasetKey={datasetKey}
        render={HomeInspirationTemplateCell}
        itemHeightEstimate={INSPIRATION_TEMPLATE_ITEM_HEIGHT_ESTIMATE}
        columnCount={
          isMobile ? HOME_INSPIRATION_MOBILE_COLUMN_COUNT : HOME_INSPIRATION_DESKTOP_COLUMN_COUNT
        }
        containerClassName="min-w-0 w-full max-w-full overflow-x-hidden px-1"
      />
    </section>
  );
}

const HomeInspirationTemplateCell = memo(function HomeInspirationTemplateCell(props: {
  data: InspirationTemplate;
}) {
  return <HomeInspirationTemplateCard template={props.data} />;
});

function HomeInspirationTemplateCard(props: { template: InspirationTemplate }) {
  const { template } = props;
  const { t } = useTranslation(["ai"]);
  const name = t(`ai:${template.nameKey}`);
  const description = t(`ai:${template.descriptionKey}`);

  return (
    <article
      data-slot="home-inspiration-card"
      className="relative w-full overflow-hidden rounded-xl border border-border/60 bg-card text-left transition-colors duration-150 hover:border-border motion-reduce:transition-none"
      style={{ aspectRatio: template.aspectRatio }}
    >
      <img
        src={template.coverUrl}
        alt=""
        className="absolute inset-0 size-full object-cover"
        loading="lazy"
      />
      <div
        data-slot="home-inspiration-card-info"
        className="absolute inset-x-0 bottom-0 z-10 flex min-h-[46%] w-full flex-col justify-end gap-1 bg-[linear-gradient(to_bottom,transparent_0%,var(--color-card)_72%,var(--color-card)_100%)] px-4 pb-4 pt-16"
      >
        <h3 className="min-h-6 truncate text-headline text-label-primary" title={name}>
          {name}
        </h3>
        <p className={cn("text-caption text-label-secondary", "line-clamp-2")}>{description}</p>
      </div>
    </article>
  );
}
