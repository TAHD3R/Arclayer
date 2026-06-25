import { memo, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import {
  AdminMasonryGrid,
  getAdminMasonryDatasetKey,
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

export function HomeInspirationSection() {
  const { t } = useTranslation(["ai"]);
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState<SiteBuilderCategory>("all");
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
      <ChromeTabs
        value={activeCategory}
        onValueChange={(value) => setActiveCategory(value as SiteBuilderCategory)}
        className="sticky top-0 z-20 mb-4 min-w-0 border-b border-border/60 bg-background"
      >
        <ChromeTabsList widthMode="content">
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
    <article className="group/card flex w-full flex-col gap-3 text-left">
      <div
        className="relative w-full overflow-hidden rounded-xl border border-border/75 bg-muted/35 transition-[border-color,box-shadow] duration-200 group-hover/card:border-border group-hover/card:shadow-sm"
        style={{ aspectRatio: template.aspectRatio }}
      >
        <img
          src={template.coverUrl}
          alt=""
          className="absolute inset-0 size-full object-cover opacity-90 transition-transform duration-300 group-hover/card:scale-[1.02]"
          loading="lazy"
        />
        <div className="pointer-events-none absolute inset-0 bg-background/10 opacity-0 transition-opacity duration-200 group-hover/card:opacity-100" />
      </div>
      <div className="flex w-full shrink-0 flex-col justify-center gap-1 px-1">
        <h3 className="min-h-6 truncate text-headline text-label-primary" title={name}>
          {name}
        </h3>
        <p className={cn("text-caption text-label-secondary", "line-clamp-2")}>{description}</p>
      </div>
    </article>
  );
}
