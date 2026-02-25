import * as React from "react";
import { useTranslation } from "react-i18next";

import { getErrorMessage, notifyErrorText } from "@/lib/notifications";
import { useEditorConfig } from "@/pages/workspaces/editor/contexts/editor-config-context";
import { useEditorBridgeContext } from "@/pages/workspaces/editor/contexts/editor-bridge-context";
import { useEditorSaveContext } from "@/pages/workspaces/editor/contexts/editor-save-context";
import { useEditorStore } from "@/pages/workspaces/editor/stores/editor-store";

export type EditorActionId =
  | "file.save_draft"
  | "file.publish"
  | "edit.undo"
  | "edit.redo"
  | "edit.delete"
  | "edit.duplicate"
  | "view.zoom_in"
  | "view.zoom_out"
  | "view.zoom_reset"
  | "view.toggle_preview"
  | "tool.select"
  | "tool.hand";

export function useEditorActions(): {
  isEnabled: (id: EditorActionId) => boolean;
  run: (id: EditorActionId) => Promise<void>;
} {
  const { t } = useTranslation(["content_pages"]);
  const { editorMode } = useEditorConfig();
  const { portal } = useEditorBridgeContext();
  const { saveDraft, publish } = useEditorSaveContext();

  const isPageMode = editorMode === "page";

  const isDirty = useEditorStore((s) => s.isDirty);
  const isSaving = useEditorStore((s) => s.isSaving);
  const isPublishing = useEditorStore((s) => s.isPublishing);
  const bridgeStatus = useEditorStore((s) => s.bridgeStatus);
  const canUndo = useEditorStore((s) => s.canUndo);
  const canRedo = useEditorStore((s) => s.canRedo);
  const setHistoryState = useEditorStore((s) => s.setHistoryState);
  const selectedBlockId = useEditorStore((s) => s.selectedBlockId);
  const setSelectedBlockId = useEditorStore((s) => s.setSelectedBlockId);
  const zoomPercent = useEditorStore((s) => s.zoomPercent);
  const setZoomPercent = useEditorStore((s) => s.setZoomPercent);
  const setActiveTool = useEditorStore((s) => s.setActiveTool);
  const togglePreviewMode = useEditorStore((s) => s.togglePreviewMode);
  const setInspectorData = useEditorStore((s) => s.setInspectorData);
  const setLayerTree = useEditorStore((s) => s.setLayerTree);
  const setDirty = useEditorStore((s) => s.setDirty);

  const isEnabled = React.useCallback(
    (id: EditorActionId) => {
      switch (id) {
        case "file.save_draft":
          return isPageMode && Boolean(portal) && isDirty && !isSaving;
        case "file.publish":
          return isPageMode && !isPublishing && bridgeStatus === "connected";
        case "edit.undo":
          return Boolean(portal) && canUndo;
        case "edit.redo":
          return Boolean(portal) && canRedo;
        case "edit.delete":
        case "edit.duplicate":
          return bridgeStatus === "connected" && Boolean(portal) && Boolean(selectedBlockId);
        case "view.zoom_in":
          return zoomPercent < 200;
        case "view.zoom_out":
          return zoomPercent > 25;
        case "view.zoom_reset":
          return zoomPercent !== 100;
        case "view.toggle_preview":
          return true;
        case "tool.select":
        case "tool.hand":
          return true;
      }
    },
    [
      bridgeStatus,
      canRedo,
      canUndo,
      isDirty,
      isPageMode,
      isPublishing,
      isSaving,
      portal,
      selectedBlockId,
      zoomPercent,
    ],
  );

  const run = React.useCallback(
    async (id: EditorActionId) => {
      try {
        switch (id) {
          case "file.save_draft": {
            if (!portal) {
              notifyErrorText(t("content_pages:EDITOR_SHELL_BRIDGE_DISCONNECTED"));
              return;
            }
            const doc = await portal.getDocument();
            await saveDraft(doc);
            return;
          }
          case "file.publish": {
            await publish();
            return;
          }
          case "edit.undo": {
            const next = await portal?.undo();
            if (next) setHistoryState(next);
            return;
          }
          case "edit.redo": {
            const next = await portal?.redo();
            if (next) setHistoryState(next);
            return;
          }
          case "edit.delete": {
            if (!portal || bridgeStatus !== "connected") {
              notifyErrorText(t("content_pages:EDITOR_SHELL_BRIDGE_DISCONNECTED"));
              return;
            }
            if (!selectedBlockId) return;

            // Optimistic local selection reset keeps the inspector consistent even if the bridge is slow.
            setSelectedBlockId(null);
            const layers = await portal.deleteBlock({ blockId: selectedBlockId });
            setLayerTree(layers);

            const inspector = await portal.getSelectionInspector();
            setSelectedBlockId(inspector.blockId);
            setInspectorData(inspector);
            const history = await portal.getHistoryState();
            setHistoryState(history);
            setDirty(true);
            return;
          }
          case "edit.duplicate": {
            if (!portal || bridgeStatus !== "connected") {
              notifyErrorText(t("content_pages:EDITOR_SHELL_BRIDGE_DISCONNECTED"));
              return;
            }
            if (!selectedBlockId) return;

            const out = await portal.duplicateBlock({ blockId: selectedBlockId });
            setSelectedBlockId(out.blockId);
            setInspectorData(out.inspector);
            setLayerTree(out.layers);
            const history = await portal.getHistoryState();
            setHistoryState(history);
            setDirty(true);
            return;
          }
          case "view.zoom_in": {
            setZoomPercent(zoomPercent + 10);
            return;
          }
          case "view.zoom_out": {
            setZoomPercent(zoomPercent - 10);
            return;
          }
          case "view.zoom_reset": {
            setZoomPercent(100);
            return;
          }
          case "view.toggle_preview": {
            togglePreviewMode();
            return;
          }
          case "tool.select": {
            setActiveTool("select");
            return;
          }
          case "tool.hand": {
            setActiveTool("hand");
            return;
          }
        }
      } catch (err) {
        notifyErrorText(getErrorMessage(err));
      }
    },
    [
      portal,
      publish,
      saveDraft,
      setActiveTool,
      setHistoryState,
      bridgeStatus,
      selectedBlockId,
      setDirty,
      setInspectorData,
      setLayerTree,
      setSelectedBlockId,
      setZoomPercent,
      t,
      togglePreviewMode,
      zoomPercent,
    ],
  );

  return { isEnabled, run };
}
