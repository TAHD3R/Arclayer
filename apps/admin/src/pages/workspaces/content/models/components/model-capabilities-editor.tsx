import { Checkbox } from "antd";
import type { ContentModelCapability } from "@celestial/api-client";

import { CONTENT_MODEL_CAPABILITY_LABEL_KEYS } from "./content-model-labels";

const CAPABILITY_OPTIONS: ContentModelCapability[] = [
  "versioned",
  "routable",
  "treeable",
  "visual_editable",
  "rich_text_editable",
  "queryable",
  "has_slots",
  "has_relations",
  "localizable",
  "publishable",
  "schedulable",
  "seo_managed",
];

export function ModelCapabilitiesEditor(props: {
  disabled?: boolean;
  value: ContentModelCapability[];
  onChange: (value: ContentModelCapability[]) => void;
  translate: (key: string) => string;
}) {
  return (
    <div className="grid gap-2">
      <label className="font-semibold text-foreground">
        {props.translate("content_library:MODELS_SECTION_CAPABILITIES")}
      </label>
      <Checkbox.Group
        disabled={props.disabled}
        value={props.value}
        options={CAPABILITY_OPTIONS.map((capability) => ({
          value: capability,
          label: props.translate(CONTENT_MODEL_CAPABILITY_LABEL_KEYS[capability]),
        }))}
        onChange={(value) => props.onChange(value as ContentModelCapability[])}
      />
    </div>
  );
}
