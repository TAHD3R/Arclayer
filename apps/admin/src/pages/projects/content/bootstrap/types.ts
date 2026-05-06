import type { LucideIcon } from "lucide-react";

import type { AdminContentBootstrapPresetState } from "@arclayer/openapi/admin-types";
import type { AdminContentCapabilityPackId } from "@arclayer/openapi/admin-types";

export type ContentBootstrapPresetKey =
  | "page"
  | "post"
  | "reusable-block"
  | "email-template"
  | "taxonomy-item"
  | "blank";

export type ContentBootstrapPresetDefinition = {
  key: ContentBootstrapPresetKey;
  icon: LucideIcon;
  packIds: AdminContentCapabilityPackId[];
  nameKey: string;
  descriptionKey: string;
  useCaseKey: string;
};

export type ContentBootstrapCapabilityPackDefinition = {
  id: AdminContentCapabilityPackId;
  icon: LucideIcon;
  nameKey: string;
  descriptionKey: string;
};

export type ContentBootstrapShapeSelection = {
  presetKey: ContentBootstrapPresetKey | null;
  presetState: AdminContentBootstrapPresetState;
  capabilityPackIds: AdminContentCapabilityPackId[];
};
