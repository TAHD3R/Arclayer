import * as React from "react";
import { useTranslation } from "react-i18next";

import { resolveBreakpointNameByWidth } from "@celestial/site-block-protocol";
import {
  EDITOR_PAGE_ROOT_BLOCK_ID,
  type EditorSelectionPatchSection,
} from "@celestial/site-editor-protocol";

import { getErrorMessage, notifyErrorText } from "@/lib/notifications";
import { useEditorBridgeContext } from "@/pages/workspaces/editor/contexts/editor-bridge-context";
import { useEditorStore } from "@/pages/workspaces/editor/stores/editor-store";
import { DEVICE_PRESET_WIDTHS } from "@/pages/workspaces/editor/constants/canvas";

export type EditorSelectionPatchCommitMode = "immediate" | "debounced";

export function useEditorSelectionPatch() {
  const { t } = useTranslation(["content_pages"]);
  const { portal } = useEditorBridgeContext();

  const setInspectorData = useEditorStore((s) => s.setInspectorData);
  const setDirty = useEditorStore((s) => s.setDirty);
  const selectedBlockId = useEditorStore((s) => s.selectedBlockId);
  const devicePreset = useEditorStore((s) => s.devicePreset);
  const canvasWidth = useEditorStore((s) => s.canvasWidth);

  const warnedDisconnectedRef = React.useRef(false);
  React.useEffect(() => {
    if (portal) warnedDisconnectedRef.current = false;
  }, [portal]);

  return React.useCallback(
    async (
      section: EditorSelectionPatchSection,
      values: Record<string, unknown>,
      opts: { commit?: EditorSelectionPatchCommitMode } = {},
    ) => {
      if (!portal) {
        // Avoid toast spam when the bridge isn't ready yet (inputs can fire onChange frequently).
        if (!warnedDisconnectedRef.current) {
          warnedDisconnectedRef.current = true;
          notifyErrorText(t("content_pages:EDITOR_SHELL_BRIDGE_DISCONNECTED"));
        }
        return null;
      }

      try {
        const breakpoint = resolveBreakpointNameByWidth(
          canvasWidth ?? DEVICE_PRESET_WIDTHS[devicePreset],
        );
        const shouldUseBreakpointOverride =
          Boolean(selectedBlockId) &&
          selectedBlockId !== EDITOR_PAGE_ROOT_BLOCK_ID &&
          section !== "component" &&
          breakpoint !== "wide";

        const nextInspector = shouldUseBreakpointOverride
          ? await portal.setBreakpointOverride({
              blockId: selectedBlockId as string,
              breakpoint,
              patch: { section, values },
            })
          : await portal.applySelectionPatch({
              patch: { section, values },
              commit: opts.commit ?? "debounced",
            });

        setInspectorData(nextInspector);
        setDirty(true);
        return nextInspector;
      } catch (err) {
        notifyErrorText(getErrorMessage(err));
        return null;
      }
    },
    [canvasWidth, devicePreset, portal, selectedBlockId, setDirty, setInspectorData, t],
  );
}
