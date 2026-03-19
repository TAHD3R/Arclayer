import {
  Blocks,
  FileText,
  FolderTree,
  Globe,
  Languages,
  LayoutTemplate,
  Mail,
  Route,
  Rocket,
  Tags,
} from "lucide-react";

import type {
  ContentBootstrapCapabilityPackDefinition,
  ContentBootstrapPresetDefinition,
  ContentBootstrapPresetKey,
} from "./types";

export const CONTENT_BOOTSTRAP_CAPABILITY_PACKS: ContentBootstrapCapabilityPackDefinition[] = [
  {
    id: "routable",
    icon: Route,
    nameKey: "CONTENT_BOOTSTRAP_PACK_ROUTABLE_NAME",
    descriptionKey: "CONTENT_BOOTSTRAP_PACK_ROUTABLE_DESC",
  },
  {
    id: "publishable",
    icon: Rocket,
    nameKey: "CONTENT_BOOTSTRAP_PACK_PUBLISHABLE_NAME",
    descriptionKey: "CONTENT_BOOTSTRAP_PACK_PUBLISHABLE_DESC",
  },
  {
    id: "seo_managed",
    icon: Globe,
    nameKey: "CONTENT_BOOTSTRAP_PACK_SEO_NAME",
    descriptionKey: "CONTENT_BOOTSTRAP_PACK_SEO_DESC",
  },
  {
    id: "layout_bound",
    icon: LayoutTemplate,
    nameKey: "CONTENT_BOOTSTRAP_PACK_LAYOUT_BOUND_NAME",
    descriptionKey: "CONTENT_BOOTSTRAP_PACK_LAYOUT_BOUND_DESC",
  },
  {
    id: "localizable",
    icon: Languages,
    nameKey: "CONTENT_BOOTSTRAP_PACK_LOCALIZED_NAME",
    descriptionKey: "CONTENT_BOOTSTRAP_PACK_LOCALIZED_DESC",
  },
  {
    id: "reusable",
    icon: Blocks,
    nameKey: "CONTENT_BOOTSTRAP_PACK_REUSABLE_NAME",
    descriptionKey: "CONTENT_BOOTSTRAP_PACK_REUSABLE_DESC",
  },
  {
    id: "taxonomy_enabled",
    icon: Tags,
    nameKey: "CONTENT_BOOTSTRAP_PACK_TAXONOMY_NAME",
    descriptionKey: "CONTENT_BOOTSTRAP_PACK_TAXONOMY_DESC",
  },
  {
    id: "schedulable",
    icon: FolderTree,
    nameKey: "CONTENT_BOOTSTRAP_PACK_SCHEDULABLE_NAME",
    descriptionKey: "CONTENT_BOOTSTRAP_PACK_SCHEDULABLE_DESC",
  },
];

export const CONTENT_BOOTSTRAP_PRESETS: ContentBootstrapPresetDefinition[] = [
  {
    key: "page",
    icon: Globe,
    packIds: ["routable", "publishable", "seo_managed", "layout_bound"],
    nameKey: "CONTENT_BOOTSTRAP_PRESET_PAGE_NAME",
    descriptionKey: "CONTENT_BOOTSTRAP_PRESET_PAGE_DESC",
    useCaseKey: "CONTENT_BOOTSTRAP_PRESET_PAGE_USE_CASE",
  },
  {
    key: "post",
    icon: FileText,
    packIds: ["publishable", "taxonomy_enabled", "seo_managed", "schedulable"],
    nameKey: "CONTENT_BOOTSTRAP_PRESET_POST_NAME",
    descriptionKey: "CONTENT_BOOTSTRAP_PRESET_POST_DESC",
    useCaseKey: "CONTENT_BOOTSTRAP_PRESET_POST_USE_CASE",
  },
  {
    key: "reusable-block",
    icon: Blocks,
    packIds: ["reusable", "localizable"],
    nameKey: "CONTENT_BOOTSTRAP_PRESET_REUSABLE_BLOCK_NAME",
    descriptionKey: "CONTENT_BOOTSTRAP_PRESET_REUSABLE_BLOCK_DESC",
    useCaseKey: "CONTENT_BOOTSTRAP_PRESET_REUSABLE_BLOCK_USE_CASE",
  },
  {
    key: "email-template",
    icon: Mail,
    packIds: ["publishable", "localizable"],
    nameKey: "CONTENT_BOOTSTRAP_PRESET_EMAIL_TEMPLATE_NAME",
    descriptionKey: "CONTENT_BOOTSTRAP_PRESET_EMAIL_TEMPLATE_DESC",
    useCaseKey: "CONTENT_BOOTSTRAP_PRESET_EMAIL_TEMPLATE_USE_CASE",
  },
  {
    key: "taxonomy-item",
    icon: Tags,
    packIds: ["taxonomy_enabled", "localizable"],
    nameKey: "CONTENT_BOOTSTRAP_PRESET_TAXONOMY_ITEM_NAME",
    descriptionKey: "CONTENT_BOOTSTRAP_PRESET_TAXONOMY_ITEM_DESC",
    useCaseKey: "CONTENT_BOOTSTRAP_PRESET_TAXONOMY_ITEM_USE_CASE",
  },
];

export const CONTENT_BOOTSTRAP_OPTIONAL_PRESETS: ContentBootstrapPresetDefinition[] = [
  ...CONTENT_BOOTSTRAP_PRESETS,
  {
    key: "blank",
    icon: FileText,
    packIds: [],
    nameKey: "CONTENT_BOOTSTRAP_PRESET_BLANK_NAME",
    descriptionKey: "CONTENT_BOOTSTRAP_PRESET_BLANK_DESC",
    useCaseKey: "CONTENT_BOOTSTRAP_PRESET_BLANK_USE_CASE",
  },
];

export const CONTENT_BOOTSTRAP_PRESET_MAP = new Map<
  ContentBootstrapPresetKey,
  ContentBootstrapPresetDefinition
>(CONTENT_BOOTSTRAP_PRESETS.map((preset) => [preset.key, preset]));
