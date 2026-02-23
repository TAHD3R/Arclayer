import * as React from "react";

import { getErrorMessage, notifyErrorText } from "@/lib/notifications";
import { useEditorStore } from "@/pages/workspaces/editor/stores/editor-store";

import type { PortalApi } from "./use-editor-bridge";

export function useEditorHistory(portal: PortalApi | null) {
  const setHistoryState = useEditorStore((s) => s.setHistoryState);

  const onUndo = React.useCallback(async () => {
    try {
      const state = await portal?.undo();
      if (state) setHistoryState(state);
    } catch (err) {
      notifyErrorText(getErrorMessage(err));
    }
  }, [portal, setHistoryState]);

  const onRedo = React.useCallback(async () => {
    try {
      const state = await portal?.redo();
      if (state) setHistoryState(state);
    } catch (err) {
      notifyErrorText(getErrorMessage(err));
    }
  }, [portal, setHistoryState]);

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.key.toLowerCase() !== "z") return;

      e.preventDefault();
      if (e.shiftKey) {
        void onRedo();
      } else {
        void onUndo();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onUndo, onRedo]);

  return { onUndo, onRedo };
}
