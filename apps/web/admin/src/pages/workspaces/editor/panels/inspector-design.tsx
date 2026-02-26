import { Input } from "antd";

import type { EditorInspectorDesign } from "@celestial/site-editor-protocol";
import { CORE_BLOCK_MANIFESTS, PREFAB_BLOCK_MANIFESTS } from "@celestial/site-block-protocol";

import { useEditorSelectionPatch } from "@/pages/workspaces/editor/hooks/use-editor-selection-patch";

const DESIGN_KEYS = [
  "color",
  "backgroundColor",
  "borderColor",
  "borderStyle",
  "borderWidth",
  "borderRadius",
  "boxShadow",
  "opacity",
] as const;

const COLOR_FIELDS = new Set(["color", "backgroundColor", "borderColor"]);

export function InspectorDesign({
  data,
  blockType,
}: {
  data: EditorInspectorDesign;
  blockType: string | null;
}) {
  const patchSelection = useEditorSelectionPatch();
  const manifest = blockType
    ? [...PREFAB_BLOCK_MANIFESTS, ...CORE_BLOCK_MANIFESTS].find((m) => m.type === blockType)
    : null;

  const whitelist =
    manifest?.kind === "prefab" && Array.isArray(manifest.styleOverrideWhitelist)
      ? manifest.styleOverrideWhitelist
      : null;

  const keysToRender = whitelist ? DESIGN_KEYS.filter((k) => whitelist.includes(k)) : DESIGN_KEYS;

  return (
    <div className="flex flex-col gap-2">
      {keysToRender.map((key) => (
        <label key={key} className="flex items-center gap-2 text-caption">
          <span className="w-24 shrink-0 text-label-secondary">{key}</span>
          <Input
            size="small"
            type={COLOR_FIELDS.has(key) ? "color" : "text"}
            value={String(data[key] ?? "")}
            onChange={(e) =>
              void patchSelection("design", { [key]: e.target.value }, { commit: "debounced" })
            }
          />
        </label>
      ))}
    </div>
  );
}
