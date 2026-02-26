import * as React from "react";
import { useParams, useSearch } from "@tanstack/react-router";

import {
  EditorConfigProvider,
  type EditorConfig,
} from "@/pages/workspaces/editor/contexts/editor-config-context";
import { EditorBridgeProvider } from "@/pages/workspaces/editor/contexts/editor-bridge-context";
import { EditorSaveProvider } from "@/pages/workspaces/editor/contexts/editor-save-context";
import { useEditorBridge, type PortalApi } from "@/pages/workspaces/editor/hooks/use-editor-bridge";
import { useEditorAutoSave } from "@/pages/workspaces/editor/hooks/use-editor-autosave";
import { useEditorIframe } from "@/pages/workspaces/editor/hooks/use-editor-iframe";
import { useEditorSave } from "@/pages/workspaces/editor/hooks/use-editor-save";
import { useWorkspaceContentStrategy } from "@/pages/workspaces/editor/hooks/use-workspace-content-strategy";
import { useEditorStore } from "@/pages/workspaces/editor/stores/editor-store";
import { EditorLayout } from "@/pages/workspaces/editor/editor-layout";
import { EditorActionSystem } from "@/pages/workspaces/editor/components/editor-action-system";

import type { EditorHistoryState, HostEditorRpcApi } from "@celestial/site-editor-protocol";

export type WorkspaceEditorMode = "page" | "article";

export function WorkspaceEditorPage() {
  const {
    workspaceId,
    editorMode: rawEditorMode,
    entityId,
  } = useParams({
    from: "/w/$workspaceId/editor/$editorMode/$entityId",
  });
  const { pathname } = useSearch({
    from: "/w/$workspaceId/editor/$editorMode/$entityId",
  });

  const editorMode: WorkspaceEditorMode = rawEditorMode === "article" ? "article" : "page";
  const initialPathname = pathname ?? "/";

  const config = React.useMemo<EditorConfig>(
    () => ({ workspaceId, entityId, editorMode, initialPathname }),
    [workspaceId, entityId, editorMode, initialPathname],
  );

  const { iframeSrc, iframeRef, isLoading, error } = useEditorIframe({
    workspaceId,
    pathname: initialPathname,
  });

  const setSelectedBlockId = useEditorStore((s) => s.setSelectedBlockId);
  const setBridgeStatus = useEditorStore((s) => s.setBridgeStatus);
  const setHistoryState = useEditorStore((s) => s.setHistoryState);
  const setInspectorData = useEditorStore((s) => s.setInspectorData);
  const setLayerTree = useEditorStore((s) => s.setLayerTree);
  const setDirty = useEditorStore((s) => s.setDirty);

  const lastHistoryRef = React.useRef<Pick<EditorHistoryState, "undoDepth" | "redoDepth"> | null>(
    null,
  );

  // Lift save/publish to the top so requestSave can trigger a real save.
  const saveDraftRef = React.useRef<
    (doc: import("@celestial/site-block-protocol").DocumentIR) => Promise<void>
  >(null!);
  const portalRef = React.useRef<PortalApi | null>(null);

  // Stable callback that always reads the latest portal ref.
  const getDocument = React.useCallback(async () => {
    const p = portalRef.current;
    if (!p) return null;
    return p.getDocument();
  }, []);

  const hostMethods = React.useMemo<HostEditorRpcApi>(
    () => ({
      ready: () => {},
      selectionChanged: ({ blockId }) => setSelectedBlockId(blockId),
      canvasWheel: (args) => {
        // Convert iframe client coords to parent viewport coords.
        const iframe = iframeRef.current;
        const handler = useEditorStore.getState().canvasWheelHandler;
        if (!iframe || !handler) return;
        const rect = iframe.getBoundingClientRect();
        handler({
          ...args,
          clientX: rect.left + args.clientX,
          clientY: rect.top + args.clientY,
        });
      },
      requestSave: ({ document }) => {
        void saveDraftRef.current(document);
      },
      reportPresence: () => {},
      historyChanged: (state) => {
        setHistoryState(state);
        const last = lastHistoryRef.current;
        if (last && (last.undoDepth !== state.undoDepth || last.redoDepth !== state.redoDepth)) {
          setDirty(true);
        }
        lastHistoryRef.current = { undoDepth: state.undoDepth, redoDepth: state.redoDepth };
      },
      selectionInspectorChanged: ({ inspector }) => setInspectorData(inspector),
      layerTreeChanged: ({ layers }) => setLayerTree(layers),
    }),
    [setSelectedBlockId, setHistoryState, setInspectorData, setLayerTree, setDirty, iframeRef],
  );

  const bridge = useEditorBridge({
    iframeRef,
    methods: hostMethods,
    iframeReady: Boolean(iframeSrc),
  });

  // Keep portalRef in sync with the bridge portal.
  portalRef.current = bridge.portal;

  const { saveDraft, publish, draftRevisionRef } = useEditorSave({
    workspaceId,
    entityId,
    isPageMode: editorMode === "page",
    getDocument,
    bridgeStatus: bridge.status,
  });

  // Keep the ref in sync so the stable hostMethods callback can call saveDraft.
  saveDraftRef.current = saveDraft;

  const { policy: contentPolicy } = useWorkspaceContentStrategy(workspaceId);
  useEditorAutoSave({
    enabled: contentPolicy.autosave.enabled,
    intervalSec: contentPolicy.autosave.intervalSec,
    saveOnBlur: contentPolicy.autosave.saveOnBlur,
    isPageMode: editorMode === "page",
    bridgeStatus: bridge.status,
    getDocument,
    saveDraft,
  });

  // Sync bridge status to store.
  React.useEffect(() => {
    setBridgeStatus(bridge.status);
  }, [bridge.status, setBridgeStatus]);

  const bridgeCtx = React.useMemo(() => ({ portal: bridge.portal }), [bridge.portal]);
  const saveCtx = React.useMemo(
    () => ({ saveDraft, publish, draftRevisionRef }),
    [saveDraft, publish, draftRevisionRef],
  );

  return (
    <EditorConfigProvider value={config}>
      <EditorBridgeProvider value={bridgeCtx}>
        <EditorSaveProvider value={saveCtx}>
          <EditorActionSystem />
          <EditorLayout
            iframeSrc={iframeSrc}
            iframeRef={iframeRef}
            isLoading={isLoading}
            loadError={error}
          />
        </EditorSaveProvider>
      </EditorBridgeProvider>
    </EditorConfigProvider>
  );
}
