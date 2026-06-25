import type { AdminMasonryGridItem } from "@/components/common/admin-masonry-grid";

export type SiteBuilderCategory =
  | "all"
  | "landing"
  | "commerce"
  | "content"
  | "portfolio"
  | "docs"
  | "events"
  | "real-estate";

export type InspirationTemplate = AdminMasonryGridItem & {
  nameKey: string;
  descriptionKey: string;
  detailKey: string;
  category: Exclude<SiteBuilderCategory, "all">;
  coverUrl: string;
  aspectRatio: number;
  accent: string;
};

export const INSPIRATION_TEMPLATE_ITEM_HEIGHT_ESTIMATE = 286;

export const SITE_BUILDER_CATEGORIES: Array<{ key: SiteBuilderCategory; labelKey: string }> = [
  { key: "all", labelKey: "AI_CHAT_HOME_INSPIRATION_CATEGORY_ALL" },
  { key: "landing", labelKey: "AI_CHAT_HOME_INSPIRATION_CATEGORY_LANDING" },
  { key: "commerce", labelKey: "AI_CHAT_HOME_INSPIRATION_CATEGORY_COMMERCE" },
  { key: "content", labelKey: "AI_CHAT_HOME_INSPIRATION_CATEGORY_CONTENT" },
  { key: "portfolio", labelKey: "AI_CHAT_HOME_INSPIRATION_CATEGORY_PORTFOLIO" },
  { key: "docs", labelKey: "AI_CHAT_HOME_INSPIRATION_CATEGORY_DOCS" },
  { key: "events", labelKey: "AI_CHAT_HOME_INSPIRATION_CATEGORY_EVENTS" },
  { key: "real-estate", labelKey: "AI_CHAT_HOME_INSPIRATION_CATEGORY_REAL_ESTATE" },
];

export const INSPIRATION_TEMPLATES: InspirationTemplate[] = [
  {
    key: "editorial-studio",
    nameKey: "AI_CHAT_HOME_INSPIRATION_TEMPLATE_EDITORIAL_STUDIO_NAME",
    descriptionKey: "AI_CHAT_HOME_INSPIRATION_TEMPLATE_EDITORIAL_STUDIO_DESC",
    detailKey: "AI_CHAT_INSPIRATION_TEMPLATE_EDITORIAL_STUDIO_DETAIL",
    category: "content",
    coverUrl: "/inspiration/editorial-studio.jpg",
    aspectRatio: 1.32,
    accent: "bg-sky-500",
  },
  {
    key: "saas-launch-desk",
    nameKey: "AI_CHAT_HOME_INSPIRATION_TEMPLATE_SAAS_LAUNCH_NAME",
    descriptionKey: "AI_CHAT_HOME_INSPIRATION_TEMPLATE_SAAS_LAUNCH_DESC",
    detailKey: "AI_CHAT_INSPIRATION_TEMPLATE_SAAS_LAUNCH_DETAIL",
    category: "landing",
    coverUrl: "/inspiration/saas-launch.jpg",
    aspectRatio: 0.92,
    accent: "bg-blue-500",
  },
  {
    key: "architecture-index",
    nameKey: "AI_CHAT_HOME_INSPIRATION_TEMPLATE_ARCHITECTURE_INDEX_NAME",
    descriptionKey: "AI_CHAT_HOME_INSPIRATION_TEMPLATE_ARCHITECTURE_INDEX_DESC",
    detailKey: "AI_CHAT_INSPIRATION_TEMPLATE_ARCHITECTURE_INDEX_DETAIL",
    category: "portfolio",
    coverUrl: "/inspiration/architecture-index.jpg",
    aspectRatio: 1.12,
    accent: "bg-zinc-500",
  },
  {
    key: "hospitality-room-book",
    nameKey: "AI_CHAT_HOME_INSPIRATION_TEMPLATE_HOSPITALITY_ROOM_NAME",
    descriptionKey: "AI_CHAT_HOME_INSPIRATION_TEMPLATE_HOSPITALITY_ROOM_DESC",
    detailKey: "AI_CHAT_INSPIRATION_TEMPLATE_HOSPITALITY_ROOM_DETAIL",
    category: "landing",
    coverUrl: "/inspiration/hospitality-room.jpg",
    aspectRatio: 1.45,
    accent: "bg-emerald-500",
  },
  {
    key: "workspace-hub",
    nameKey: "AI_CHAT_HOME_INSPIRATION_TEMPLATE_WORKSPACE_HUB_NAME",
    descriptionKey: "AI_CHAT_HOME_INSPIRATION_TEMPLATE_WORKSPACE_HUB_DESC",
    detailKey: "AI_CHAT_INSPIRATION_TEMPLATE_WORKSPACE_HUB_DETAIL",
    category: "landing",
    coverUrl: "/inspiration/workspace-hub.jpg",
    aspectRatio: 0.86,
    accent: "bg-cyan-500",
  },
  {
    key: "commerce-atelier",
    nameKey: "AI_CHAT_HOME_INSPIRATION_TEMPLATE_COMMERCE_ATELIER_NAME",
    descriptionKey: "AI_CHAT_HOME_INSPIRATION_TEMPLATE_COMMERCE_ATELIER_DESC",
    detailKey: "AI_CHAT_INSPIRATION_TEMPLATE_COMMERCE_ATELIER_DETAIL",
    category: "commerce",
    coverUrl: "/inspiration/commerce-atelier.jpg",
    aspectRatio: 1.38,
    accent: "bg-amber-500",
  },
  {
    key: "agency-report",
    nameKey: "AI_CHAT_HOME_INSPIRATION_TEMPLATE_AGENCY_REPORT_NAME",
    descriptionKey: "AI_CHAT_HOME_INSPIRATION_TEMPLATE_AGENCY_REPORT_DESC",
    detailKey: "AI_CHAT_INSPIRATION_TEMPLATE_AGENCY_REPORT_DETAIL",
    category: "docs",
    coverUrl: "/inspiration/agency-report.jpg",
    aspectRatio: 0.98,
    accent: "bg-indigo-500",
  },
  {
    key: "travel-journal",
    nameKey: "AI_CHAT_HOME_INSPIRATION_TEMPLATE_TRAVEL_JOURNAL_NAME",
    descriptionKey: "AI_CHAT_HOME_INSPIRATION_TEMPLATE_TRAVEL_JOURNAL_DESC",
    detailKey: "AI_CHAT_INSPIRATION_TEMPLATE_TRAVEL_JOURNAL_DETAIL",
    category: "content",
    coverUrl: "/inspiration/travel-journal.jpg",
    aspectRatio: 1.5,
    accent: "bg-teal-500",
  },
  {
    key: "city-events-board",
    nameKey: "AI_CHAT_HOME_INSPIRATION_TEMPLATE_CITY_EVENTS_NAME",
    descriptionKey: "AI_CHAT_HOME_INSPIRATION_TEMPLATE_CITY_EVENTS_DESC",
    detailKey: "AI_CHAT_INSPIRATION_TEMPLATE_CITY_EVENTS_DETAIL",
    category: "events",
    coverUrl: "/inspiration/city-events.jpg",
    aspectRatio: 0.78,
    accent: "bg-rose-500",
  },
  {
    key: "real-estate-showcase",
    nameKey: "AI_CHAT_HOME_INSPIRATION_TEMPLATE_REAL_ESTATE_NAME",
    descriptionKey: "AI_CHAT_HOME_INSPIRATION_TEMPLATE_REAL_ESTATE_DESC",
    detailKey: "AI_CHAT_INSPIRATION_TEMPLATE_REAL_ESTATE_DETAIL",
    category: "real-estate",
    coverUrl: "/inspiration/real-estate-showcase.jpg",
    aspectRatio: 1.18,
    accent: "bg-lime-600",
  },
];

export function filterInspirationTemplates(category: SiteBuilderCategory): InspirationTemplate[] {
  if (category === "all") return INSPIRATION_TEMPLATES;
  return INSPIRATION_TEMPLATES.filter((template) => template.category === category);
}

export function findInspirationCategory(category: SiteBuilderCategory) {
  return (
    SITE_BUILDER_CATEGORIES.find((item) => item.key === category) ?? SITE_BUILDER_CATEGORIES[0]
  );
}
