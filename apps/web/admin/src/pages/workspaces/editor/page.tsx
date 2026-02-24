import * as React from "react";

import {
  EditorConfigProvider,
  type EditorConfig,
} from "@/pages/workspaces/editor/contexts/editor-config-context";
import { EditorBridgeProvider } from "@/pages/workspaces/editor/contexts/editor-bridge-context";
import { useEditorBridge } from "@/pages/workspaces/editor/hooks/use-editor-bridge";
import { useEditorIframe } from "@/pages/workspaces/editor/hooks/use-editor-iframe";
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
  const setDirty = useEditorStore((s) => s.setDirty);
  const setHistoryState = useEditorStore((s) => s.setHistoryState);
  const setInspectorData = useEditorStore((s) => s.setInspectorData);
  const setLayerTree = useEditorStore((s) => s.setLayerTree);

  const hostMethods = React.useMemo<HostEditorRpcApi>(
    () => ({
      ready: () => {},
      selectionChanged: ({ blockId }) => setSelectedBlockId(blockId),
      requestSave: () => setDirty(true),
      reportPresence: () => {},
      historyChanged: (state) => setHistoryState(state),
      selectionInspectorChanged: ({ inspector }) => setInspectorData(inspector),
      layerTreeChanged: ({ layers }) => setLayerTree(layers),
    }),
    [setSelectedBlockId, setDirty, setHistoryState, setInspectorData, setLayerTree],
  );

  const bridge = useEditorBridge({ iframeRef, methods: hostMethods });

  // Sync bridge status to store
  React.useEffect(() => {
    setBridgeStatus(bridge.status);
  }, [bridge.status, setBridgeStatus]);

  const bridgeCtx = React.useMemo(() => ({ portal: bridge.portal }), [bridge.portal]);

  return (
    <EditorConfigProvider value={config}>
      <EditorBridgeProvider value={bridgeCtx}>
        <EditorLayout
          iframeSrc={iframeSrc}
          iframeRef={iframeRef}
          isLoading={isLoading}
          loadError={error}
          portalOrigin={portalOrigin}
        />
      </EditorBridgeProvider>
    </EditorConfigProvider>
  );
}
