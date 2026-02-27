import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import {
  EditorConfigProvider,
  type EditorConfig,
} from "@/pages/workspaces/editor/contexts/editor-config-context";
import { EditorBridgeProvider } from "@/pages/workspaces/editor/contexts/editor-bridge-context";
import { EditorSaveProvider } from "@/pages/workspaces/editor/contexts/editor-save-context";
import {
  useEditorBridge,
  useRequestEditContentRef,
  type PortalApi,
} from "@/pages/workspaces/editor/hooks/use-editor-bridge";
import { useEditorAutoSave } from "@/pages/workspaces/editor/hooks/use-editor-autosave";
import { useEditorIframe } from "@/pages/workspaces/editor/hooks/use-editor-iframe";
import { useEditorSave } from "@/pages/workspaces/editor/hooks/use-editor-save";
import { useWorkspaceContentStrategy } from "@/pages/workspaces/editor/hooks/use-workspace-content-strategy";
import { EditorActionSystem } from "@/pages/workspaces/editor/components/editor-action-system";
import { EditorLayout } from "@/pages/workspaces/editor/editor-layout";
import { useEditorStore } from "@/pages/workspaces/editor/stores/editor-store";

import type { EditorHistoryState, HostEditorRpcApi } from "@celestial/site-editor-protocol";
import { DesignDocumentV1Schema, type DesignDocumentV1 } from "@celestial/site-block-protocol";

import {
  extractDesignDocumentFromSnapshot,
  getWorkspaceContentEntryRevision,
} from "@/api/workspace-content-entries";
import { getErrorMessage, notifyErrorText } from "@/lib/notifications";

export type WorkspaceEditorMode = "page" | "article" | "component";

function isDesignDocumentV1ForEditor(input: unknown): input is DesignDocumentV1 {
  return DesignDocumentV1Schema.safeParse(input).success;
}

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

  const editorMode: WorkspaceEditorMode =
    rawEditorMode === "article" ? "article" : rawEditorMode === "component" ? "component" : "page";
  const initialPathname = pathname ?? "/";

  const config = React.useMemo<EditorConfig>(
    () => ({ workspaceId, entityId, editorMode, initialPathname }),
    [workspaceId, entityId, editorMode, initialPathname],
  );

  const { iframeSrc, iframeRef, isLoading, error } = useEditorIframe({
    workspaceId,
    pathname: initialPathname,
  });

  const { t } = useTranslation(["content_pages"]);

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
  const saveDraftRef = React.useRef<(doc: DesignDocumentV1) => Promise<void>>(null!);
  const portalRef = React.useRef<PortalApi | null>(null);

  const requestEditContentRef = useRequestEditContentRef({ workspaceId });

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
      requestEditContentRef,
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
    [
      iframeRef,
      requestEditContentRef,
      setDirty,
      setHistoryState,
      setInspectorData,
      setLayerTree,
      setSelectedBlockId,
    ],
  );

  const bridge = useEditorBridge({
    iframeRef,
    methods: hostMethods,
    iframeReady: Boolean(iframeSrc),
  });

  portalRef.current = bridge.portal;

  const componentDraftQuery = useQuery({
    queryKey: [
      "workspace",
      workspaceId,
      "site",
      "entries",
      entityId,
      "revisions",
      "draft",
      "editorMode",
      "component",
    ],
    queryFn: () => getWorkspaceContentEntryRevision(workspaceId, entityId, "draft"),
    enabled: editorMode === "component" && Boolean(workspaceId) && Boolean(entityId),
    staleTime: 0,
    retry: false,
    meta: { silent: true },
  });

  const { saveDraft, publish, draftRevisionRef } = useEditorSave({
    workspaceId,
    entityId,
    editorMode,
    getDocument,
    bridgeStatus: bridge.status,
  });

  saveDraftRef.current = saveDraft;

  const pushedComponentDraftRevisionRef = React.useRef<number | null>(null);
  const warnedComponentDraftErrorRef = React.useRef(false);
  React.useEffect(() => {
    if (editorMode !== "component") return;
    if (bridge.status !== "connected" || !bridge.portal) return;

    if (componentDraftQuery.error && !warnedComponentDraftErrorRef.current) {
      warnedComponentDraftErrorRef.current = true;
      notifyErrorText(getErrorMessage(componentDraftQuery.error));
    }

    const revision = componentDraftQuery.data;
    if (!revision) return;
    if (pushedComponentDraftRevisionRef.current === revision.revision) return;

    const doc = extractDesignDocumentFromSnapshot(revision.snapshot);
    if (!doc || !isDesignDocumentV1ForEditor(doc)) {
      if (!warnedComponentDraftErrorRef.current) {
        warnedComponentDraftErrorRef.current = true;
        notifyErrorText(t("content_pages:EDITOR_COMPONENT_DRAFT_INVALID"));
      }
      return;
    }

    bridge.portal.pushDraftDocument({ document: doc });
    pushedComponentDraftRevisionRef.current = revision.revision;
    draftRevisionRef.current = revision.revision;
    setDirty(false);
  }, [
    bridge.portal,
    bridge.status,
    componentDraftQuery.data,
    componentDraftQuery.error,
    draftRevisionRef,
    editorMode,
    setDirty,
    t,
  ]);

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

  React.useEffect(() => {
    setBridgeStatus(bridge.status);
  }, [bridge.status, setBridgeStatus]);

  const bridgeCtx = React.useMemo(() => ({ portal: bridge.portal }), [bridge.portal]);
  const saveCtx = React.useMemo(
    () => ({ saveDraft, publish, draftRevisionRef }),
    [draftRevisionRef, publish, saveDraft],
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
