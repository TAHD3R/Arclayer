import { Input } from "antd";

import type { EditorInspectorAnimation } from "@celestial/site-editor-protocol";

import { useEditorSelectionPatch } from "@/pages/workspaces/editor/hooks/use-editor-selection-patch";

const ANIMATION_KEYS = ["type", "trigger", "durationMs", "delayMs", "easing"] as const;

export function InspectorAnimation({ data }: { data: EditorInspectorAnimation }) {
  const patchSelection = useEditorSelectionPatch();

  return (
    <div className="flex flex-col gap-2">
      {ANIMATION_KEYS.map((key) => (
        <label key={key} className="flex items-center gap-2 text-caption">
          <span className="w-24 shrink-0 text-label-secondary">{key}</span>
          <Input
            size="small"
            value={String(data[key] ?? "")}
            onChange={(e) =>
              void patchSelection("animation", { [key]: e.target.value }, { commit: "debounced" })
            }
          />
        </label>
      ))}
    </div>
  );
}
