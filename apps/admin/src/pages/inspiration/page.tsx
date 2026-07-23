import { memo, useMemo, useState } from "react";
import { ListFilterIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { DataTableSearchInput } from "@/components/common/data-table-search-input";
import { ViewModeToggle, type ViewMode } from "@/components/common/view-mode-toggle";
import {
  AdminMasonryGrid,
  getAdminMasonryDatasetKey,
  type AdminMasonryGridItem,
} from "@/components/common/admin-masonry-grid";
import { buildReuiFilterI18n } from "@/components/common/reui-filter-i18n";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import { PageExtraToolbar } from "@/layouts/page-shell/page-extra-toolbar";
import { cn } from "@arclayer/lib/utils";
import { Button } from "@arclayer/ui/button";
import { ChromeTabs, ChromeTabsList, ChromeTabsTrigger } from "@arclayer/ui/chrome-tabs";
import { Filters, createFilter, type Filter, type FilterFieldConfig } from "@arclayer/ui/filters";

import {
  filterInspirationTemplates,
  findInspirationCategory,
  INSPIRATION_TEMPLATE_ITEM_HEIGHT_ESTIMATE,
  INSPIRATION_TEMPLATES,
  SITE_BUILDER_CATEGORIES,
  type InspirationTemplate,
  type SiteBuilderCategory,
} from "./inspiration-catalog";

type InspirationFilterValue = Exclude<SiteBuilderCategory, "all">;

type InspirationGridItem = AdminMasonryGridItem & {
  template: InspirationTemplate;
  selected: boolean;
  onSelect: (template: InspirationTemplate) => void;
};

function isTemplateCategory(value: string): value is InspirationFilterValue {
  return SITE_BUILDER_CATEGORIES.some((category) => category.key === value && value !== "all");
}

function toInspirationFilters(category: SiteBuilderCategory): Filter<InspirationFilterValue>[] {
  if (category === "all") return [];
  return [createFilter("category", "is", [category])];
}

function filterTemplatesBySearch(
  templates: InspirationTemplate[],
  searchInput: string,
  t: (key: string) => string,
) {
  const query = searchInput.trim().toLocaleLowerCase();
  if (!query) return templates;

  return templates.filter((template) => {
    const category = findInspirationCategory(template.category);
    const haystack = [
      template.key,
      t(`ai:${template.nameKey}`),
      t(`ai:${template.descriptionKey}`),
      t(`ai:${template.detailKey}`),
      t(`ai:${category.labelKey}`),
    ]
      .join(" ")
      .toLocaleLowerCase();
    return haystack.includes(query);
  });
}

export function InspirationPage() {
  const { t } = useTranslation(["ai", "nav", "common"]);
  const [activeCategory, setActiveCategory] = useState<SiteBuilderCategory>("all");
  const [searchInput, setSearchInput] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("card");
  const [selectedTemplateKey, setSelectedTemplateKey] = useState(INSPIRATION_TEMPLATES[0].key);
  const categoryTemplates = useMemo(
    () => filterInspirationTemplates(activeCategory),
    [activeCategory],
  );
  const templates = useMemo(
    () => filterTemplatesBySearch(categoryTemplates, searchInput, t),
    [categoryTemplates, searchInput, t],
  );
  const selectedTemplate = useMemo(
    () =>
      templates.find((template) => template.key === selectedTemplateKey) ??
      templates[0] ??
      categoryTemplates[0] ??
      INSPIRATION_TEMPLATES[0],
    [categoryTemplates, selectedTemplateKey, templates],
  );
  const gridItems = useMemo<InspirationGridItem[]>(
    () =>
      templates.map((template) => ({
        key: template.key,
        template,
        selected: template.key === selectedTemplate.key,
        onSelect: (nextTemplate) => setSelectedTemplateKey(nextTemplate.key),
      })),
    [selectedTemplate.key, templates],
  );
  const filterItems = useMemo(() => toInspirationFilters(activeCategory), [activeCategory]);
  const categoryFilterFields = useMemo<FilterFieldConfig<InspirationFilterValue>[]>(
    () => [
      {
        key: "category",
        label: t("ai:AI_CHAT_INSPIRATION_FILTER_CATEGORY"),
        type: "select",
        icon: <ListFilterIcon className="size-4" />,
        searchable: false,
        operators: [{ value: "is", label: t("common:FILTER_OPERATOR_IS") }],
        options: SITE_BUILDER_CATEGORIES.filter((category) => category.key !== "all").map(
          (category) => ({
            value: category.key as InspirationFilterValue,
            label: t(`ai:${category.labelKey}`),
          }),
        ),
      },
    ],
    [t],
  );
  const filterI18n = useMemo(
    () => buildReuiFilterI18n(t, t("ai:AI_CHAT_INSPIRATION_FILTER_TITLE")),
    [t],
  );
  const datasetKey = useMemo(
    () =>
      getAdminMasonryDatasetKey(
        `inspiration:${activeCategory}`,
        templates.map((template) => template.key),
      ),
    [activeCategory, templates],
  );

  return (
    <DefaultPage
      title={t("ai:AI_CHAT_INSPIRATION_PAGE_TITLE")}
      contentContainerClassName="mx-auto w-full max-w-[94rem]"
      showFavoriteToggle={false}
    >
      <div className="flex min-w-0 flex-col gap-8">
        <FeaturedTemplatePanel template={selectedTemplate} />
        <section className="min-w-0" aria-label={t("ai:AI_CHAT_INSPIRATION_CATALOG_TITLE")}>
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
          <PageExtraToolbar
            leading={
              <>
                <DataTableSearchInput
                  value={searchInput}
                  onChange={setSearchInput}
                  placeholder={t("ai:AI_CHAT_INSPIRATION_SEARCH_PLACEHOLDER")}
                  clearLabel={t("common:CLEAR")}
                />
                <Filters
                  filters={filterItems}
                  fields={categoryFilterFields}
                  onChange={(nextFilters) => {
                    const nextCategory = nextFilters.find((filter) => filter.field === "category")
                      ?.values[0];
                    setActiveCategory(
                      typeof nextCategory === "string" && isTemplateCategory(nextCategory)
                        ? nextCategory
                        : "all",
                    );
                  }}
                  i18n={filterI18n}
                  allowMultiple={false}
                  trigger={
                    <Button variant="outline" aria-label={t("ai:AI_CHAT_INSPIRATION_FILTER_TITLE")}>
                      <ListFilterIcon className="size-4" />
                    </Button>
                  }
                />
              </>
            }
            trailing={<ViewModeToggle t={t} value={viewMode} onChange={setViewMode} />}
            className="mb-4"
            trailingClassName="justify-end"
          />
          {viewMode === "card" ? (
            <AdminMasonryGrid
              items={gridItems}
              datasetKey={datasetKey}
              render={InspirationTemplateCell}
              itemHeightEstimate={INSPIRATION_TEMPLATE_ITEM_HEIGHT_ESTIMATE}
              containerClassName="min-w-0 w-full max-w-full overflow-x-hidden px-1"
            />
          ) : (
            <InspirationTemplateList items={gridItems} />
          )}
        </section>
      </div>
    </DefaultPage>
  );
}

function FeaturedTemplatePanel(props: { template: InspirationTemplate }) {
  const { t } = useTranslation(["ai"]);
  const category = findInspirationCategory(props.template.category);
  const name = t(`ai:${props.template.nameKey}`);
  const description = t(`ai:${props.template.descriptionKey}`);
  const detail = t(`ai:${props.template.detailKey}`);

  return (
    <section
      className="grid min-w-0 gap-5 rounded-lg border border-border/70 bg-card p-4 shadow-sm md:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]"
      aria-labelledby="inspiration-featured-title"
    >
      <div className="relative min-h-[18rem] overflow-hidden rounded-lg bg-muted/35">
        <img
          src={props.template.coverUrl}
          alt=""
          className="absolute inset-0 size-full object-cover"
        />
      </div>
      <div className="flex min-w-0 flex-col justify-between gap-6 py-1">
        <div>
          <div className="mb-3 text-caption text-label-secondary">
            {t("ai:AI_CHAT_INSPIRATION_FEATURED_LABEL")}
          </div>
          <h2 id="inspiration-featured-title" className="text-title2 text-label-primary">
            {name}
          </h2>
          <div className="mt-3 space-y-3 text-body leading-relaxed text-label-secondary">
            <p>{description}</p>
            <p>{detail}</p>
          </div>
        </div>
        <dl className="grid gap-3 sm:grid-cols-2 md:grid-cols-1 xl:grid-cols-2">
          <TemplateMeta
            label={t("ai:AI_CHAT_INSPIRATION_CATEGORY_LABEL")}
            value={t(`ai:${category.labelKey}`)}
          />
          <TemplateMeta
            label={t("ai:AI_CHAT_INSPIRATION_FORMAT_LABEL")}
            value={t("ai:AI_CHAT_INSPIRATION_FORMAT_VALUE")}
          />
        </dl>
      </div>
    </section>
  );
}

function TemplateMeta(props: { label: string; value: string }) {
  return (
    <div className="border-t border-border/60 pt-3">
      <dt className="text-caption text-label-tertiary">{props.label}</dt>
      <dd className="mt-1 truncate text-footnote font-semibold text-label-primary">
        {props.value}
      </dd>
    </div>
  );
}

const InspirationTemplateCell = memo(function InspirationTemplateCell(props: {
  data: InspirationGridItem;
}) {
  return <InspirationTemplateCard item={props.data} />;
});

function InspirationTemplateCard(props: { item: InspirationGridItem }) {
  const { t } = useTranslation(["ai"]);
  const { template } = props.item;
  const name = t(`ai:${template.nameKey}`);
  const description = t(`ai:${template.descriptionKey}`);

  return (
    <button
      type="button"
      className={cn(
        "group/card flex w-full flex-col gap-3 text-left outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      )}
      aria-pressed={props.item.selected}
      onClick={() => props.item.onSelect(template)}
    >
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
      <div className="flex w-full shrink-0 flex-col justify-center px-1">
        <h3 className="min-h-6 truncate text-headline text-label-primary" title={name}>
          {name}
        </h3>
        <p className={cn("text-caption text-label-secondary", "line-clamp-2")}>{description}</p>
      </div>
    </button>
  );
}

function InspirationTemplateList(props: { items: InspirationGridItem[] }) {
  return (
    <div className="flex min-w-0 flex-col divide-y divide-border/60 rounded-lg border border-border/70 bg-card">
      {props.items.map((item) => (
        <InspirationTemplateListItem key={item.key} item={item} />
      ))}
    </div>
  );
}

function InspirationTemplateListItem(props: { item: InspirationGridItem }) {
  const { t } = useTranslation(["ai"]);
  const { template } = props.item;
  const category = findInspirationCategory(template.category);
  const name = t(`ai:${template.nameKey}`);
  const description = t(`ai:${template.descriptionKey}`);

  return (
    <button
      type="button"
      className={cn(
        "grid min-w-0 grid-cols-[5.5rem_minmax(0,1fr)] gap-4 px-4 py-3 text-left outline-none transition-colors hover:bg-muted/45",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        props.item.selected && "bg-accent/35 hover:bg-accent/45",
      )}
      aria-pressed={props.item.selected}
      onClick={() => props.item.onSelect(template)}
    >
      <div className="relative aspect-[1.25] overflow-hidden rounded-md border border-border/70 bg-muted/35">
        <img src={template.coverUrl} alt="" className="absolute inset-0 size-full object-cover" />
      </div>
      <div className="min-w-0 self-center">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="truncate text-headline text-label-primary" title={name}>
            {name}
          </h3>
          <span className="shrink-0 text-caption text-label-tertiary">
            {t(`ai:${category.labelKey}`)}
          </span>
        </div>
        <p className="mt-1 line-clamp-2 text-caption text-label-secondary">{description}</p>
      </div>
    </button>
  );
}
