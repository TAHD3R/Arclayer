import * as React from "react";

import {
  EditorConfigProvider,
  type EditorConfig,
} from "@/pages/workspaces/editor/contexts/editor-config-context";
import { EditorBridgeProvider } from "@/pages/workspaces/editor/contexts/editor-bridge-context";
import { EditorSaveProvider } from "@/pages/workspaces/editor/contexts/editor-save-context";
import { useEditorBridge, type PortalApi } from "@/pages/workspaces/editor/hooks/use-editor-bridge";
import { useEditorIframe } from "@/pages/workspaces/editor/hooks/use-editor-iframe";
import { useEditorSave } from "@/pages/workspaces/editor/hooks/use-editor-save";
import { useEditorStore } from "@/pages/workspaces/editor/stores/editor-store";
import { EditorLayout } from "@/pages/workspaces/editor/editor-layout";

import type { HostEditorRpcApi } from "@celestial/site-editor-protocol";

export type WorkspaceEditorMode = "page" | "article";

export type WorkspaceEditorViewProps = {
  workspaceId: string;
  editorMode: WorkspaceEditorMode;
  entityId: string;
  initialPathname?: string;
};

export function WorkspaceEditorView(props: WorkspaceEditorViewProps) {
  const { workspaceId, editorMode, entityId, initialPathname = "/" } = props;

  const config = React.useMemo<EditorConfig>(
    () => ({ workspaceId, entityId, editorMode, initialPathname }),
    [workspaceId, entityId, editorMode, initialPathname],
  );

  const { iframeSrc, iframeRef, isLoading, error, portalOrigin } = useEditorIframe({
    workspaceId,
    pathname: initialPathname,
  });

  const setSelectedBlockId = useEditorStore((s) => s.setSelectedBlockId);
  const setBridgeStatus = useEditorStore((s) => s.setBridgeStatus);
  const setHistoryState = useEditorStore((s) => s.setHistoryState);
  const setInspectorData = useEditorStore((s) => s.setInspectorData);
  const setLayerTree = useEditorStore((s) => s.setLayerTree);

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
      requestSave: ({ document }) => {
        void saveDraftRef.current(document);
      },
      reportPresence: () => {},
      historyChanged: (state) => setHistoryState(state),
      selectionInspectorChanged: ({ inspector }) => setInspectorData(inspector),
      layerTreeChanged: ({ layers }) => setLayerTree(layers),
    }),
    [setSelectedBlockId, setHistoryState, setInspectorData, setLayerTree],
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
          <EditorLayout
            iframeSrc={iframeSrc}
            iframeRef={iframeRef}
            isLoading={isLoading}
            loadError={error}
            portalOrigin={portalOrigin}
          />
        </EditorSaveProvider>
      </EditorBridgeProvider>
    </EditorConfigProvider>
  );
}
