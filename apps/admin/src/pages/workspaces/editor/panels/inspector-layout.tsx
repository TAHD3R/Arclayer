import { Input } from "antd";

import type { EditorInspectorLayout } from "@celestial/editor-protocol";

import { useEditorSelectionPatch } from "@/pages/workspaces/editor/hooks/use-editor-selection-patch";

const LAYOUT_KEYS = [
  "width",
  "minWidth",
  "maxWidth",
  "height",
  "minHeight",
  "maxHeight",
  "margin",
  "padding",
  "paddingX",
  "paddingY",
  "gap",
  "display",
  "direction",
  "wrap",
  "justifyContent",
  "alignItems",
] as const;

export function InspectorLayout({ data }: { data: EditorInspectorLayout }) {
  const patchSelection = useEditorSelectionPatch();

  return (
    <div className="flex flex-col gap-2">
      {LAYOUT_KEYS.map((key) => (
        <label key={key} className="flex items-center gap-2 text-caption">
          <span className="w-24 shrink-0 text-label-secondary">{key}</span>
          <Input
            size="small"
            value={String(data[key] ?? "")}
            onChange={(e) =>
              void patchSelection("layout", { [key]: e.target.value }, { commit: "debounced" })
            }
          />
        </label>
      ))}
    </div>
  );
}
