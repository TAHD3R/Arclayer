import {
  Alert,
  Button,
  Divider,
  Dropdown,
  Input,
  InputNumber,
  Select,
  Space,
  Switch,
  Tabs,
  Tooltip,
} from "antd";
import type { MenuProps, TabsProps } from "antd";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  Eye,
  Hammer,
  Home,
  Layers,
  Minus,
  Monitor,
  PencilLine,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Search,
  Smartphone,
  Tablet,
  Undo2,
  Upload,
  ZoomIn,
} from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";

import type { DocumentIR } from "@celestial/site-block-protocol";
import type {
  EditorCanvasPreferences,
  EditorDevicePreset,
  EditorLayerNode,
  EditorOverlayMode,
  EditorSizingMode,
  EditorSelectionInspector,
} from "@celestial/site-editor-protocol";
import {
  createEditorHostConnector,
  isHttpOrigin,
  normalizePathname,
} from "@celestial/site-editor-bridge";
import type {
  EditorHostConnector,
  EditorHostPenpalConnection,
} from "@celestial/site-editor-bridge";

import { listAssets } from "@/api/assets";
import { listAdminUIExtensions } from "@/api/admin-extensions";
import {
  createWorkspaceSiteGlobalSection,
  deleteWorkspaceSiteGlobalSection,
  getWorkspaceSitePage,
  getWorkspaceSiteStyle,
  getWorkspaceSiteVisualSitemap,
  listWorkspaceSiteGlobalSections,
  listWorkspaceSitePagesTree,
  patchWorkspaceSiteGlobalSection,
  publishWorkspaceSitePage,
  saveWorkspaceSitePageDraft,
  upsertWorkspaceSiteStyle,
} from "@/api/workspace-site";
import {
  getErrorMessage,
  notifyErrorText,
  notifyInfoText,
  notifySuccessText,
} from "@/lib/notifications";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { WorkspaceEditorIframe } from "@/pages/workspaces/editor/workspace-editor-iframe";
import { formatWorkspaceEditorSaveError } from "@/pages/workspaces/editor/workspace-editor-errors";

export type WorkspaceEditorMode = "page" | "article";

type SaveStatus = "idle" | "saving" | "error";
type PublishStatus = "idle" | "publishing" | "error";
type BridgeStatus = "disconnected" | "connecting" | "connected";
type EditorViewMode = "edit" | "preview";
type LeftPanelKey =
  | "elements"
  | "layers"
  | "assets"
  | "pages"
  | "sitemap"
  | "styles"
  | "global_sections";

type FlatPageNode = {
  id: string;
  title: string;
  path: string;
  depth: number;
};

type PagePickerGroupKey = "static" | "template";

type PagePickerOption = {
  value: string;
  label: string;
  title: string;
  path: string;
  depth: number;
  groupKey: PagePickerGroupKey;
  isCurrent: boolean;
  disabled?: boolean;
  emptyState?: boolean;
};

type PagePickerGroup = {
  key: PagePickerGroupKey;
  label: string;
  options: PagePickerOption[];
};

type CanvasBooleanPreferenceKey = Exclude<keyof EditorCanvasPreferences, "sizingMode">;

export type WorkspaceEditorViewProps = {
  workspaceId: string;
  editorMode: WorkspaceEditorMode;
  entityId: string;
  initialPathname?: string;
};

const DEVICE_WIDTH: Record<EditorDevicePreset, number> = {
  desktop: 1440,
  tablet: 834,
  mobile: 390,
};

const EMPTY_INSPECTOR: EditorSelectionInspector = {
  blockId: null,
  blockType: null,
  component: {},
  layout: {},
  design: {},
  animation: {},
};

const DEFAULT_CANVAS_PREFERENCES: EditorCanvasPreferences = {
  showRulers: false,
  showGuides: false,
  showBounds: true,
  showCanvasIndications: true,
  sizingMode: "fit",
};

const SHORTCUT_HINTS = {
  save: "Cmd/Ctrl+S",
  publish: "Shift+Cmd/Ctrl+P",
  preview: "Shift+P",
  zoomIn: "Cmd/Ctrl++",
  zoomOut: "Cmd/Ctrl+-",
  zoomReset: "Cmd/Ctrl+0",
  undo: "Cmd/Ctrl+Z",
  redo: "Shift+Cmd/Ctrl+Z",
} as const;

function toStringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toNumberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readLocalizedText(value: unknown, locale: string): string {
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  const text = record[locale];
  return typeof text === "string" ? text : "";
}

function flattenPagesTree(
  nodes:
    | Array<{ id: string; title?: string | null; path: string; children: Array<unknown> }>
    | undefined,
  depth = 0,
): FlatPageNode[] {
  if (!Array.isArray(nodes)) return [];
  const rows: FlatPageNode[] = [];
  for (const node of nodes) {
    rows.push({
      id: node.id,
      title: node.title?.trim() || node.path,
      path: node.path,
      depth,
    });

    const children = Array.isArray(node.children)
      ? (node.children as Array<{
          id: string;
          title?: string | null;
          path: string;
          children: Array<unknown>;
        }>)
      : [];
    rows.push(...flattenPagesTree(children, depth + 1));
  }
  return rows;
}

function renderMenuLabel(label: string, shortcut?: string): React.ReactNode {
  return (
    <div className="flex min-w-[180px] items-center justify-between gap-3">
      <span>{label}</span>
      {shortcut ? <span className="text-xs text-muted-foreground">{shortcut}</span> : null}
    </div>
  );
}

const SelectOption = Select.Option;
const SelectOptGroup = Select.OptGroup;

export function WorkspaceEditorView(props: WorkspaceEditorViewProps) {
  const { workspaceId, editorMode, entityId, initialPathname } = props;
  const { t } = useTranslation(["content_pages", "content_library", "common"]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const isPageMode = editorMode === "page";
  const portalOrigin = React.useMemo(() => {
    const raw = import.meta.env.VITE_PORTAL_ORIGIN;
    return raw && isHttpOrigin(raw) ? raw : "http://localhost:3100";
  }, []);

  const [pathname, setPathname] = React.useState(() => normalizePathname(initialPathname || "/"));
  const [iframeElement, setIframeElement] = React.useState<HTMLIFrameElement | null>(null);

  const [overlayMode, setOverlayMode] = React.useState<EditorOverlayMode>("edit");
  const [editorViewMode, setEditorViewMode] = React.useState<EditorViewMode>("edit");
  const [selectedBlockId, setSelectedBlockId] = React.useState<string | null>(null);
  const [selectionInspector, setSelectionInspector] =
    React.useState<EditorSelectionInspector>(EMPTY_INSPECTOR);
  const [layerTree, setLayerTree] = React.useState<EditorLayerNode[]>([]);

  const [bridgeStatus, setBridgeStatus] = React.useState<BridgeStatus>("disconnected");
  const [bridgeError, setBridgeError] = React.useState<string | null>(null);
  const [lastPingRttMs, setLastPingRttMs] = React.useState<number | null>(null);
  const [lastPingError, setLastPingError] = React.useState<string | null>(null);

  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("idle");
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [lastSavedRevision, setLastSavedRevision] = React.useState<number | null>(null);

  const [publishStatus, setPublishStatus] = React.useState<PublishStatus>("idle");
  const [publishError, setPublishError] = React.useState<string | null>(null);
  const [lastPublishedRevision, setLastPublishedRevision] = React.useState<number | null>(null);

  const [hasDraftOverride, setHasDraftOverride] = React.useState(false);
  const [lastPresenceAtMs, setLastPresenceAtMs] = React.useState<number | null>(null);

  const [devicePreset, setDevicePreset] = React.useState<EditorDevicePreset>("desktop");
  const [zoomPercent, setZoomPercent] = React.useState<number>(100);
  const [canvasPreferences, setCanvasPreferences] = React.useState<EditorCanvasPreferences>(
    DEFAULT_CANVAS_PREFERENCES,
  );
  const [canUndo, setCanUndo] = React.useState(false);
  const [canRedo, setCanRedo] = React.useState(false);
  const [pagePickerOpen, setPagePickerOpen] = React.useState(false);
  const [pagePickerKeyword, setPagePickerKeyword] = React.useState("");

  const [leftPanelKey, setLeftPanelKey] = React.useState<LeftPanelKey>("elements");
  const [styleDraft, setStyleDraft] = React.useState<Record<string, unknown>>({
    colorPrimary: "#1677ff",
    backgroundColor: "#ffffff",
  });

  const portalRef = React.useRef<EditorHostPenpalConnection["portal"] | null>(null);
  const connectorRef = React.useRef<EditorHostConnector | null>(null);
  const overlayModeRef = React.useRef<EditorOverlayMode>("edit");
  const pingSeqRef = React.useRef(0);
  const draftRevisionRef = React.useRef<number | null>(null);
  const lastSaveRequestRef = React.useRef<{
    pathname: string;
    document: DocumentIR;
  } | null>(null);

  React.useEffect(() => {
    if (!initialPathname) return;
    setPathname(normalizePathname(initialPathname));
  }, [initialPathname]);

  const pageDetailQuery = useQuery({
    queryKey: ["workspace", workspaceId, "site", "pages", entityId],
    enabled: isPageMode && Boolean(workspaceId) && Boolean(entityId),
    queryFn: async () => getWorkspaceSitePage(workspaceId, entityId),
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const pagesTreeQuery = useQuery({
    queryKey: ["workspace", workspaceId, "site", "pages", "tree", "editor"],
    enabled: Boolean(workspaceId),
    queryFn: async () => listWorkspaceSitePagesTree(workspaceId),
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const assetsQuery = useQuery({
    queryKey: ["workspace", workspaceId, "editor", "assets"],
    enabled: Boolean(workspaceId),
    queryFn: async () => listAssets(workspaceId, { page: 1, size: 12 }),
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const toolsExtensionsQuery = useQuery({
    queryKey: ["workspace", workspaceId, "adminExtensions", "editor-tools"],
    enabled: Boolean(workspaceId),
    queryFn: async () => listAdminUIExtensions(workspaceId, { slot: "admin.editor.tools.menu" }),
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const siteStyleQuery = useQuery({
    queryKey: ["workspace", workspaceId, "editor", "site-style"],
    enabled: Boolean(workspaceId),
    queryFn: async () => getWorkspaceSiteStyle(workspaceId),
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const globalSectionsQuery = useQuery({
    queryKey: ["workspace", workspaceId, "editor", "global-sections"],
    enabled: Boolean(workspaceId),
    queryFn: async () => listWorkspaceSiteGlobalSections(workspaceId),
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const visualSitemapQuery = useQuery({
    queryKey: ["workspace", workspaceId, "editor", "visual-sitemap"],
    enabled: Boolean(workspaceId),
    queryFn: async () => getWorkspaceSiteVisualSitemap(workspaceId),
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });

  React.useEffect(() => {
    if (!siteStyleQuery.data?.value) return;
    setStyleDraft(siteStyleQuery.data.value);
  }, [siteStyleQuery.data?.value]);

  const upsertStyleMutation = useMutation({
    mutationFn: async () => upsertWorkspaceSiteStyle(workspaceId, { value: styleDraft }),
    onSuccess: () => {
      notifySuccessText(
        t("content_pages:EDITOR_V2_STYLE_SAVE_SUCCESS", { defaultValue: "Site style saved." }),
      );
      void queryClient.invalidateQueries({
        queryKey: ["workspace", workspaceId, "editor", "site-style"],
      });
    },
    onError: (err) => notifyErrorText(getErrorMessage(err)),
  });

  const createGlobalSectionMutation = useMutation({
    mutationFn: async () =>
      createWorkspaceSiteGlobalSection(workspaceId, {
        name: t("content_pages:EDITOR_V2_GLOBAL_SECTION_DEFAULT_NAME", {
          defaultValue: "New section",
        }),
        kind: "generic",
        enabled: true,
        payload: {
          note: t("content_pages:EDITOR_V2_GLOBAL_SECTION_DEFAULT_NOTE", {
            defaultValue: "Configure content in future iterations.",
          }),
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["workspace", workspaceId, "editor", "global-sections"],
      });
    },
    onError: (err) => notifyErrorText(getErrorMessage(err)),
  });

  React.useEffect(() => {
    if (!isPageMode) {
      draftRevisionRef.current = null;
      setLastSavedRevision(null);
      setLastPublishedRevision(null);
      return;
    }

    const draftRevision = pageDetailQuery.data?.draftRevision;
    if (typeof draftRevision === "number" && Number.isFinite(draftRevision)) {
      const normalized = Math.max(0, draftRevision);
      draftRevisionRef.current = normalized;
      setLastSavedRevision(normalized);
    }

    const publishedRevision = pageDetailQuery.data?.publishedRevision;
    if (typeof publishedRevision === "number" && Number.isFinite(publishedRevision)) {
      setLastPublishedRevision(Math.max(0, publishedRevision));
    }
  }, [isPageMode, pageDetailQuery.data?.draftRevision, pageDetailQuery.data?.publishedRevision]);

  React.useEffect(() => {
    overlayModeRef.current = overlayMode;
  }, [overlayMode]);

  React.useEffect(() => {
    return () => {
      portalRef.current = null;
      connectorRef.current?.disconnect();
      connectorRef.current = null;
    };
  }, []);

  const sendPing = React.useCallback(async (opts?: { silent?: boolean }) => {
    const portal = portalRef.current;
    if (!portal) return;

    const seq = ++pingSeqRef.current;
    try {
      if (!opts?.silent) setLastPingError(null);
      const sentAt = Date.now();
      await portal.ping({ sentAt });
      if (seq !== pingSeqRef.current) return;
      setLastPingRttMs(Date.now() - sentAt);
    } catch (err) {
      if (seq !== pingSeqRef.current) return;
      if (opts?.silent) return;
      setLastPingRttMs(null);
      setLastPingError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const setChildOverlayMode = React.useCallback((mode: EditorOverlayMode) => {
    setOverlayMode(mode);
    void portalRef.current?.setOverlayMode({ mode });
    if (mode === "off") {
      setSelectedBlockId(null);
      setSelectionInspector(EMPTY_INSPECTOR);
    }
  }, []);

  const persistPageDraft = React.useCallback(
    async (payload: { pathname: string; document: DocumentIR }) => {
      if (!isPageMode) {
        notifyInfoText(t("content_pages:EDITOR_SHELL_SAVE_DISABLED_NON_PAGE"));
        return;
      }

      const normalizedPath = normalizePathname(payload.pathname);
      setPathname((prev) => (prev === normalizedPath ? prev : normalizedPath));

      setSaveStatus("saving");
      setSaveError(null);

      try {
        const out = await saveWorkspaceSitePageDraft(workspaceId, entityId, {
          document: payload.document,
          expectedRevision: draftRevisionRef.current,
        });

        draftRevisionRef.current = out.revision;
        setLastSavedRevision(out.revision);
        setSaveStatus("idle");
      } catch (err) {
        const text = formatWorkspaceEditorSaveError(err, t);
        setSaveStatus("error");
        setSaveError(text);
        notifyErrorText(text);
      }
    },
    [entityId, isPageMode, t, workspaceId],
  );

  const onSaveFromHeader = React.useCallback(() => {
    if (!isPageMode) {
      notifyInfoText(t("content_pages:EDITOR_SHELL_SAVE_DISABLED_NON_PAGE"));
      return;
    }

    const lastRequest = lastSaveRequestRef.current;
    if (!lastRequest) {
      notifyInfoText(t("content_pages:EDITOR_SHELL_SAVE_NEEDS_SHORTCUT"));
      return;
    }

    void persistPageDraft(lastRequest);
  }, [isPageMode, persistPageDraft, t]);

  const onPublish = React.useCallback(() => {
    if (!isPageMode) {
      notifyInfoText(t("content_pages:EDITOR_SHELL_PUBLISH_DISABLED_NON_PAGE"));
      return;
    }

    void (async () => {
      setPublishStatus("publishing");
      setPublishError(null);

      try {
        const revision = draftRevisionRef.current;
        const out = await publishWorkspaceSitePage(
          workspaceId,
          entityId,
          revision === null ? {} : { revision },
        );

        setPublishStatus("idle");
        setLastPublishedRevision(out.revision);
        notifySuccessText(
          t("content_pages:EDITOR_SHELL_PUBLISH_SUCCESS", {
            revision: out.revision,
          }),
        );
      } catch (err) {
        const text = getErrorMessage(err);
        setPublishStatus("error");
        setPublishError(text);
        notifyErrorText(text);
      }
    })();
  }, [entityId, isPageMode, t, workspaceId]);

  const updateInspector = React.useCallback(
    async (
      section: "component" | "layout" | "design" | "animation",
      values: Record<string, unknown>,
    ) => {
      const portal = portalRef.current;
      if (!portal || !selectedBlockId) return;
      try {
        const inspector = await portal.applySelectionPatch({
          patch: {
            section,
            values,
          },
          commit: "immediate",
        });
        setSelectionInspector(inspector);
      } catch (err) {
        notifyErrorText(getErrorMessage(err));
      }
    },
    [selectedBlockId],
  );

  const insertBlock = React.useCallback(
    async (type: "container" | "heading" | "paragraph" | "divider") => {
      const portal = portalRef.current;
      if (!portal) return;
      try {
        const result = await portal.insertBlock({ type, position: "inside" });
        setSelectedBlockId(result.blockId);
        setSelectionInspector(result.inspector);
        setLayerTree(result.layers);
      } catch (err) {
        notifyErrorText(getErrorMessage(err));
      }
    },
    [],
  );

  const applyDevicePreset = React.useCallback(async (preset: EditorDevicePreset) => {
    setDevicePreset(preset);
    const portal = portalRef.current;
    if (!portal) return;
    try {
      const canvas = await portal.setDevicePreset({ devicePreset: preset });
      setDevicePreset(canvas.devicePreset);
      setZoomPercent(canvas.zoomPercent);
      setCanvasPreferences(canvas.preferences);
    } catch (err) {
      notifyErrorText(getErrorMessage(err));
    }
  }, []);

  const applyZoom = React.useCallback(async (value: number) => {
    const safe = Math.max(25, Math.min(200, Math.round(value)));
    setZoomPercent(safe);
    const portal = portalRef.current;
    if (!portal) return;
    try {
      const canvas = await portal.setZoom({ zoomPercent: safe });
      setZoomPercent(canvas.zoomPercent);
      setCanvasPreferences(canvas.preferences);
      setDevicePreset(canvas.devicePreset);
    } catch (err) {
      notifyErrorText(getErrorMessage(err));
    }
  }, []);

  const toggleCanvasPreference = React.useCallback(
    async (key: CanvasBooleanPreferenceKey, value: boolean) => {
      setCanvasPreferences((prev) => ({
        ...prev,
        [key]: value,
      }));
      const portal = portalRef.current;
      if (!portal) return;
      try {
        const canvas = await portal.setCanvasPreferences({
          preferences: {
            [key]: value,
          },
        });
        setCanvasPreferences(canvas.preferences);
      } catch (err) {
        notifyErrorText(getErrorMessage(err));
      }
    },
    [],
  );

  const setCanvasSizingMode = React.useCallback(async (mode: EditorSizingMode) => {
    setCanvasPreferences((prev) => ({
      ...prev,
      sizingMode: mode,
    }));

    const portal = portalRef.current;
    if (!portal) return;

    try {
      const canvas = await portal.setCanvasPreferences({
        preferences: {
          sizingMode: mode,
        },
      });
      setCanvasPreferences(canvas.preferences);
    } catch (err) {
      notifyErrorText(getErrorMessage(err));
    }
  }, []);

  const onUndo = React.useCallback(async () => {
    try {
      const state = await portalRef.current?.undo();
      if (!state) return;
      setCanUndo(state.canUndo);
      setCanRedo(state.canRedo);
    } catch (err) {
      notifyErrorText(getErrorMessage(err));
    }
  }, []);

  const onRedo = React.useCallback(async () => {
    try {
      const state = await portalRef.current?.redo();
      if (!state) return;
      setCanUndo(state.canUndo);
      setCanRedo(state.canRedo);
    } catch (err) {
      notifyErrorText(getErrorMessage(err));
    }
  }, []);

  React.useEffect(() => {
    if (!iframeElement) return;

    const connector = createEditorHostConnector({
      iframe: iframeElement,
      childOrigin: portalOrigin,
      methods: {
        ready: () => {
          setBridgeError(null);
        },
        selectionChanged: ({ blockId }) => {
          setSelectedBlockId(blockId);
        },
        selectionInspectorChanged: ({ inspector }) => {
          setSelectionInspector(inspector);
          setSelectedBlockId(inspector.blockId);
        },
        historyChanged: ({ canUndo: nextCanUndo, canRedo: nextCanRedo }) => {
          setCanUndo(nextCanUndo);
          setCanRedo(nextCanRedo);
        },
        layerTreeChanged: ({ layers }) => {
          setLayerTree(layers);
        },
        canvasChanged: ({ canvas }) => {
          setDevicePreset(canvas.devicePreset);
          setZoomPercent(canvas.zoomPercent);
          setCanvasPreferences(canvas.preferences);
        },
        requestSave: ({ pathname: requestPathname, document }) => {
          const normalizedPath = normalizePathname(requestPathname);
          setPathname((prev) => (prev === normalizedPath ? prev : normalizedPath));
          lastSaveRequestRef.current = {
            pathname: normalizedPath,
            document,
          };
          void persistPageDraft({
            pathname: normalizedPath,
            document,
          });
        },
        reportPresence: ({ presence }) => {
          const normalizedPath = normalizePathname(presence.pathname);
          setPathname((prev) => (prev === normalizedPath ? prev : normalizedPath));
          setHasDraftOverride(presence.hasDraftOverride);
          setLastPresenceAtMs(presence.updatedAtMs);
          if (presence.canvasState) {
            setDevicePreset(presence.canvasState.devicePreset);
            setZoomPercent(presence.canvasState.zoomPercent);
            setCanvasPreferences(presence.canvasState.preferences);
          }
        },
      },
      onConnected: async (portal) => {
        portalRef.current = portal;
        setBridgeStatus("connected");
        setBridgeError(null);
        void sendPing({ silent: true });
        await portal.setOverlayMode({ mode: overlayModeRef.current });

        const [historyState, inspector, layers, canvas] = await Promise.all([
          portal.getHistoryState(),
          portal.getSelectionInspector(),
          portal.getLayerTree(),
          portal.getCanvasState(),
        ]);

        setCanUndo(historyState.canUndo);
        setCanRedo(historyState.canRedo);
        setSelectionInspector(inspector);
        setSelectedBlockId(inspector.blockId);
        setLayerTree(layers);
        setDevicePreset(canvas.devicePreset);
        setZoomPercent(canvas.zoomPercent);
        setCanvasPreferences(canvas.preferences);
      },
      onError: (err) => {
        setBridgeStatus("disconnected");
        setBridgeError(err instanceof Error ? err.message : String(err));
      },
    });

    connectorRef.current = connector;

    const connect = () => {
      setBridgeStatus("connecting");
      setBridgeError(null);
      void connector.connect();
    };

    const onLoad = () => {
      portalRef.current = null;
      connect();
    };

    iframeElement.addEventListener("load", onLoad);
    const timer = window.setTimeout(connect, 0);

    return () => {
      iframeElement.removeEventListener("load", onLoad);
      window.clearTimeout(timer);
      portalRef.current = null;
      connector.disconnect();
      if (connectorRef.current === connector) {
        connectorRef.current = null;
      }
      setBridgeStatus("disconnected");
    };
  }, [iframeElement, persistPageDraft, portalOrigin, sendPing]);

  const isBusy = saveStatus === "saving" || publishStatus === "publishing";
  const saveDisabled = !isPageMode || isBusy;
  const publishDisabled = !isPageMode || isBusy;

  const bridgeStatusText =
    bridgeStatus === "connected"
      ? t("content_pages:EDITOR_SHELL_BRIDGE_CONNECTED")
      : bridgeStatus === "connecting"
        ? t("content_pages:EDITOR_SHELL_BRIDGE_CONNECTING")
        : t("content_pages:EDITOR_SHELL_BRIDGE_DISCONNECTED");

  const saveText =
    saveStatus === "saving"
      ? t("content_pages:EDITOR_SHELL_SAVE_STATUS_SAVING")
      : saveStatus === "error"
        ? t("content_pages:EDITOR_SHELL_SAVE_STATUS_ERROR")
        : t("content_pages:EDITOR_SHELL_SAVE_STATUS_IDLE");

  const publishText =
    publishStatus === "publishing"
      ? t("content_pages:EDITOR_SHELL_PUBLISH_STATUS_PUBLISHING")
      : publishStatus === "error"
        ? t("content_pages:EDITOR_SHELL_PUBLISH_STATUS_ERROR")
        : t("content_pages:EDITOR_SHELL_PUBLISH_STATUS_IDLE");

  const presenceTime =
    lastPresenceAtMs === null
      ? t("content_pages:PLACEHOLDER_DASH")
      : new Date(lastPresenceAtMs).toLocaleTimeString();

  const flatPages = React.useMemo(
    () =>
      flattenPagesTree(
        pagesTreeQuery.data?.items as
          | Array<{
              id: string;
              title?: string | null;
              path: string;
              children: Array<unknown>;
            }>
          | undefined,
      ),
    [pagesTreeQuery.data?.items],
  );

  const pagePickerGroups = React.useMemo<PagePickerGroup[]>(() => {
    const keyword = pagePickerKeyword.trim().toLowerCase();
    const staticOptions = flatPages
      .map(
        (page): PagePickerOption => ({
          value: page.id,
          label: page.title,
          title: page.title,
          path: page.path,
          depth: page.depth,
          groupKey: "static",
          isCurrent: page.id === entityId,
        }),
      )
      .filter((option) => {
        if (!keyword) return true;
        return (
          option.title.toLowerCase().includes(keyword) ||
          option.path.toLowerCase().includes(keyword)
        );
      });

    const templateOptions: PagePickerOption[] = [];

    return [
      {
        key: "static",
        label: t("content_pages:EDITOR_V2_PAGE_PICKER_GROUP_STATIC", {
          defaultValue: "Static pages",
        }),
        options:
          staticOptions.length > 0
            ? staticOptions
            : [
                {
                  value: "__page-picker-empty-static",
                  label: t("content_pages:EDITOR_V2_PAGE_PICKER_EMPTY_STATIC", {
                    defaultValue: "No pages found.",
                  }),
                  title: "",
                  path: "",
                  depth: 0,
                  groupKey: "static",
                  isCurrent: false,
                  disabled: true,
                  emptyState: true,
                },
              ],
      },
      {
        key: "template",
        label: t("content_pages:EDITOR_V2_PAGE_PICKER_GROUP_TEMPLATE", {
          defaultValue: "Template pages",
        }),
        options:
          templateOptions.length > 0
            ? templateOptions
            : [
                {
                  value: "__page-picker-empty-template",
                  label: t("content_pages:EDITOR_V2_PAGE_PICKER_EMPTY_TEMPLATE", {
                    defaultValue: "No templates available yet.",
                  }),
                  title: "",
                  path: "",
                  depth: 0,
                  groupKey: "template",
                  isCurrent: false,
                  disabled: true,
                  emptyState: true,
                },
              ],
      },
    ];
  }, [entityId, flatPages, pagePickerKeyword, t]);

  const onSelectPage = React.useCallback(
    (pageId: string) => {
      const targetPage = flatPages.find((item) => item.id === pageId);
      if (!targetPage || targetPage.id === entityId) return;

      setPagePickerOpen(false);
      setPagePickerKeyword("");

      void navigate({
        to: "/w/$workspaceId/editor/$editorMode/$entityId",
        params: {
          workspaceId,
          editorMode: "page",
          entityId: targetPage.id,
        },
        search: { pathname: targetPage.path },
      });
    },
    [entityId, flatPages, navigate, workspaceId],
  );

  const onOpenPagesDashboard = React.useCallback(() => {
    setPagePickerOpen(false);
    setPagePickerKeyword("");

    void navigate({
      to: "/w/$workspaceId/content/pages",
      params: { workspaceId },
    });
  }, [navigate, workspaceId]);

  const selectedPageValue = React.useMemo(
    () => (flatPages.some((item) => item.id === entityId) ? entityId : undefined),
    [entityId, flatPages],
  );

  const siteMenuItems = React.useMemo<NonNullable<MenuProps["items"]>>(
    () => [
      {
        key: "preview",
        icon: <Eye className="h-4 w-4" />,
        label: renderMenuLabel(
          t("content_pages:EDITOR_V2_SITE_ACTION_PREVIEW", { defaultValue: "Preview" }),
          SHORTCUT_HINTS.preview,
        ),
        onClick: () => setEditorViewMode("preview"),
      },
      {
        key: "save",
        icon: <Save className="h-4 w-4" />,
        label: renderMenuLabel(
          t("content_pages:EDITOR_V2_SITE_ACTION_SAVE", { defaultValue: "Save draft" }),
          SHORTCUT_HINTS.save,
        ),
        onClick: onSaveFromHeader,
      },
      {
        key: "publish",
        icon: <Upload className="h-4 w-4" />,
        label: renderMenuLabel(
          t("content_pages:EDITOR_V2_SITE_ACTION_PUBLISH", { defaultValue: "Publish" }),
          SHORTCUT_HINTS.publish,
        ),
        onClick: onPublish,
      },
    ],
    [onPublish, onSaveFromHeader, t],
  );

  const toolsMenuItems = React.useMemo<NonNullable<MenuProps["items"]>>(() => {
    const base: NonNullable<MenuProps["items"]> = [
      {
        key: "toggle-overlay",
        icon: <Layers className="h-4 w-4" />,
        label: renderMenuLabel(
          t("content_pages:EDITOR_V2_TOOLS_TOGGLE_OVERLAY", { defaultValue: "Toggle overlay" }),
        ),
        onClick: () => setChildOverlayMode(overlayMode === "off" ? "edit" : "off"),
      },
      {
        key: "ping",
        icon: <Search className="h-4 w-4" />,
        label: renderMenuLabel(
          t("content_pages:EDITOR_V2_TOOLS_PING", { defaultValue: "Ping bridge" }),
        ),
        onClick: () => {
          void sendPing();
        },
      },
    ];

    for (const ext of toolsExtensionsQuery.data ?? []) {
      base.push({
        key: `ext-${ext.pluginId}-${ext.id}`,
        icon: <Hammer className="h-4 w-4" />,
        label: renderMenuLabel(ext.title),
        onClick: () => {
          const to = typeof ext.meta?.to === "string" ? ext.meta.to : null;
          if (!to) {
            notifyInfoText(ext.title);
            return;
          }
          if (/^https?:\/\//.test(to)) {
            window.open(to, "_blank", "noopener,noreferrer");
            return;
          }
          void navigate({ to: to as never });
        },
      });
    }

    return base;
  }, [navigate, overlayMode, sendPing, setChildOverlayMode, t, toolsExtensionsQuery.data]);

  const viewsMenuItems = React.useMemo<NonNullable<MenuProps["items"]>>(
    () => [
      {
        key: "zoom-in",
        icon: <ZoomIn className="h-4 w-4" />,
        label: renderMenuLabel(
          t("content_pages:EDITOR_V2_VIEWS_ZOOM_IN", { defaultValue: "Zoom in" }),
          SHORTCUT_HINTS.zoomIn,
        ),
        onClick: () => void applyZoom(zoomPercent + 10),
      },
      {
        key: "zoom-out",
        icon: <Minus className="h-4 w-4" />,
        label: renderMenuLabel(
          t("content_pages:EDITOR_V2_VIEWS_ZOOM_OUT", { defaultValue: "Zoom out" }),
          SHORTCUT_HINTS.zoomOut,
        ),
        onClick: () => void applyZoom(zoomPercent - 10),
      },
      {
        key: "zoom-reset",
        icon: <RotateCcw className="h-4 w-4" />,
        label: renderMenuLabel(
          t("content_pages:EDITOR_V2_VIEWS_ZOOM_RESET", { defaultValue: "Reset zoom" }),
          SHORTCUT_HINTS.zoomReset,
        ),
        onClick: () => void applyZoom(100),
      },
      {
        type: "divider",
      },
      {
        key: "overlay-off",
        icon: <Eye className="h-4 w-4" />,
        label: renderMenuLabel(t("content_pages:EDITOR_SHELL_OVERLAY_OFF")),
        onClick: () => setChildOverlayMode("off"),
      },
      {
        key: "overlay-inspect",
        icon: <Search className="h-4 w-4" />,
        label: renderMenuLabel(t("content_pages:EDITOR_SHELL_OVERLAY_INSPECT")),
        onClick: () => setChildOverlayMode("inspect"),
      },
      {
        key: "overlay-edit",
        icon: <PencilLine className="h-4 w-4" />,
        label: renderMenuLabel(t("content_pages:EDITOR_SHELL_OVERLAY_EDIT")),
        onClick: () => setChildOverlayMode("edit"),
      },
      {
        type: "divider",
      },
      {
        key: "toggle-rulers",
        icon: <Layers className="h-4 w-4" />,
        label: renderMenuLabel(
          t("content_pages:EDITOR_V2_VIEWS_RULERS", { defaultValue: "Show rulers" }),
        ),
        onClick: () => void toggleCanvasPreference("showRulers", !canvasPreferences.showRulers),
      },
      {
        key: "toggle-guides",
        icon: <Layers className="h-4 w-4" />,
        label: renderMenuLabel(
          t("content_pages:EDITOR_V2_VIEWS_GUIDES", { defaultValue: "Show guides" }),
        ),
        onClick: () => void toggleCanvasPreference("showGuides", !canvasPreferences.showGuides),
      },
      {
        key: "toggle-bounds",
        icon: <Layers className="h-4 w-4" />,
        label: renderMenuLabel(
          t("content_pages:EDITOR_V2_VIEWS_BOUNDS", { defaultValue: "Show bounds" }),
        ),
        onClick: () => void toggleCanvasPreference("showBounds", !canvasPreferences.showBounds),
      },
      {
        key: "toggle-canvas-indications",
        icon: <Monitor className="h-4 w-4" />,
        label: renderMenuLabel(
          t("content_pages:EDITOR_V2_CANVAS_INDICATIONS", { defaultValue: "Canvas indications" }),
        ),
        onClick: () =>
          void toggleCanvasPreference(
            "showCanvasIndications",
            !canvasPreferences.showCanvasIndications,
          ),
      },
    ],
    [
      applyZoom,
      canvasPreferences.showBounds,
      canvasPreferences.showCanvasIndications,
      canvasPreferences.showGuides,
      canvasPreferences.showRulers,
      setChildOverlayMode,
      t,
      toggleCanvasPreference,
      zoomPercent,
    ],
  );

  const logoMenuItems = React.useMemo<MenuProps["items"]>(
    () => [
      {
        key: "dashboard",
        icon: <Home className="h-4 w-4" />,
        label: renderMenuLabel(
          t("content_pages:EDITOR_V2_LOGO_BACK_DASHBOARD", { defaultValue: "Back to dashboard" }),
        ),
        onClick: () => {
          void navigate({
            to: "/w/$workspaceId/content/pages",
            params: { workspaceId },
          });
        },
      },
      {
        type: "divider",
      },
      {
        key: "site",
        icon: <Home className="h-4 w-4" />,
        label: t("content_pages:EDITOR_V2_MENU_SITE", { defaultValue: "Site" }),
        children: siteMenuItems,
      },
      {
        key: "tools",
        icon: <Hammer className="h-4 w-4" />,
        label: t("content_pages:EDITOR_V2_MENU_TOOLS", { defaultValue: "Tools" }),
        children: toolsMenuItems,
      },
      {
        key: "views",
        icon: <Layers className="h-4 w-4" />,
        label: t("content_pages:EDITOR_V2_MENU_VIEWS", { defaultValue: "Views" }),
        children: viewsMenuItems,
      },
    ],
    [navigate, siteMenuItems, t, toolsMenuItems, viewsMenuItems, workspaceId],
  );

  const leftMenuItems: Array<{ key: LeftPanelKey; label: string }> = [
    {
      key: "elements",
      label: t("content_pages:EDITOR_V2_LEFT_ELEMENTS", { defaultValue: "Add element" }),
    },
    {
      key: "layers",
      label: t("content_pages:EDITOR_V2_LEFT_LAYERS", { defaultValue: "Layers" }),
    },
    {
      key: "assets",
      label: t("content_pages:EDITOR_V2_LEFT_ASSETS", { defaultValue: "Asset library" }),
    },
    {
      key: "pages",
      label: t("content_pages:EDITOR_V2_LEFT_PAGES", { defaultValue: "Pages" }),
    },
    {
      key: "sitemap",
      label: t("content_pages:EDITOR_V2_LEFT_SITEMAP", { defaultValue: "Visual sitemap" }),
    },
    {
      key: "styles",
      label: t("content_pages:EDITOR_V2_LEFT_STYLES", { defaultValue: "Site style" }),
    },
    {
      key: "global_sections",
      label: t("content_pages:EDITOR_V2_LEFT_GLOBAL_SECTIONS", { defaultValue: "Global sections" }),
    },
  ];

  const inspectorComponent = selectionInspector.component;
  const inspectorLayout = selectionInspector.layout;
  const inspectorDesign = selectionInspector.design;
  const inspectorAnimation = selectionInspector.animation;

  const inspectorTabs: TabsProps["items"] = [
    {
      key: "sizing",
      label: t("content_pages:EDITOR_V2_RIGHT_TAB_SIZING", { defaultValue: "Sizing" }),
      children: (
        <Space direction="vertical" size={10} className="w-full">
          <div>
            <div className="mb-1 text-xs text-muted-foreground">
              {t("content_pages:EDITOR_V2_FIELD_WIDTH", { defaultValue: "Width" })}
            </div>
            <Input
              value={toStringValue(inspectorLayout.width)}
              onChange={(event) =>
                void updateInspector("layout", {
                  width: event.target.value,
                })
              }
            />
          </div>
          <div>
            <div className="mb-1 text-xs text-muted-foreground">
              {t("content_pages:EDITOR_V2_FIELD_HEIGHT", { defaultValue: "Height" })}
            </div>
            <Input
              value={toStringValue(inspectorLayout.height)}
              onChange={(event) =>
                void updateInspector("layout", {
                  height: event.target.value,
                })
              }
            />
          </div>
        </Space>
      ),
    },
    {
      key: "component",
      label: t("content_pages:EDITOR_V2_RIGHT_TAB_COMPONENT", { defaultValue: "Component" }),
      children: (
        <Space direction="vertical" size={10} className="w-full">
          {selectionInspector.blockType === "heading" ? (
            <>
              <div>
                <div className="mb-1 text-xs text-muted-foreground">
                  {t("content_pages:EDITOR_V2_FIELD_HEADING_LEVEL", {
                    defaultValue: "Heading level",
                  })}
                </div>
                <InputNumber
                  min={1}
                  max={6}
                  value={toNumberValue(inspectorComponent.level)}
                  onChange={(value) => {
                    if (typeof value !== "number") return;
                    void updateInspector("component", { level: value });
                  }}
                  className="w-full"
                />
              </div>
              <div>
                <div className="mb-1 text-xs text-muted-foreground">zh-CN</div>
                <Input
                  value={readLocalizedText(inspectorComponent.text, "zh-CN")}
                  onChange={(event) => {
                    const next = {
                      ...(typeof inspectorComponent.text === "object" && inspectorComponent.text
                        ? (inspectorComponent.text as Record<string, unknown>)
                        : {}),
                      "zh-CN": event.target.value,
                    };
                    void updateInspector("component", { text: next });
                  }}
                />
              </div>
              <div>
                <div className="mb-1 text-xs text-muted-foreground">en-US</div>
                <Input
                  value={readLocalizedText(inspectorComponent.text, "en-US")}
                  onChange={(event) => {
                    const next = {
                      ...(typeof inspectorComponent.text === "object" && inspectorComponent.text
                        ? (inspectorComponent.text as Record<string, unknown>)
                        : {}),
                      "en-US": event.target.value,
                    };
                    void updateInspector("component", { text: next });
                  }}
                />
              </div>
              <div>
                <div className="mb-1 text-xs text-muted-foreground">
                  {t("content_pages:EDITOR_V2_FIELD_ALIGN", { defaultValue: "Align" })}
                </div>
                <Select
                  value={toStringValue(inspectorComponent.align) || "left"}
                  options={[
                    { value: "left", label: "Left" },
                    { value: "center", label: "Center" },
                    { value: "right", label: "Right" },
                  ]}
                  onChange={(value) => void updateInspector("component", { align: value })}
                  className="w-full"
                />
              </div>
            </>
          ) : null}

          {selectionInspector.blockType === "paragraph" ? (
            <>
              <div>
                <div className="mb-1 text-xs text-muted-foreground">zh-CN</div>
                <Input
                  value={readLocalizedText(inspectorComponent.text, "zh-CN")}
                  onChange={(event) => {
                    const next = {
                      ...(typeof inspectorComponent.text === "object" && inspectorComponent.text
                        ? (inspectorComponent.text as Record<string, unknown>)
                        : {}),
                      "zh-CN": event.target.value,
                    };
                    void updateInspector("component", { text: next });
                  }}
                />
              </div>
              <div>
                <div className="mb-1 text-xs text-muted-foreground">en-US</div>
                <Input
                  value={readLocalizedText(inspectorComponent.text, "en-US")}
                  onChange={(event) => {
                    const next = {
                      ...(typeof inspectorComponent.text === "object" && inspectorComponent.text
                        ? (inspectorComponent.text as Record<string, unknown>)
                        : {}),
                      "en-US": event.target.value,
                    };
                    void updateInspector("component", { text: next });
                  }}
                />
              </div>
            </>
          ) : null}

          {selectionInspector.blockType === "container" ? (
            <>
              <div>
                <div className="mb-1 text-xs text-muted-foreground">
                  {t("content_pages:EDITOR_V2_FIELD_CONTAINER_TAG", {
                    defaultValue: "Container tag",
                  })}
                </div>
                <Select
                  value={toStringValue(inspectorComponent.as) || "section"}
                  options={[
                    { value: "div", label: "div" },
                    { value: "section", label: "section" },
                    { value: "article", label: "article" },
                  ]}
                  onChange={(value) => void updateInspector("component", { as: value })}
                  className="w-full"
                />
              </div>
              <div>
                <div className="mb-1 text-xs text-muted-foreground">
                  {t("content_pages:EDITOR_V2_FIELD_CLASS_NAME", { defaultValue: "Class name" })}
                </div>
                <Input
                  value={toStringValue(inspectorComponent.className)}
                  onChange={(event) =>
                    void updateInspector("component", {
                      className: event.target.value,
                    })
                  }
                />
              </div>
            </>
          ) : null}

          {selectionInspector.blockType === "divider" ? (
            <div>
              <div className="mb-1 text-xs text-muted-foreground">
                {t("content_pages:EDITOR_V2_FIELD_DIVIDER_VARIANT", { defaultValue: "Variant" })}
              </div>
              <Select
                value={toStringValue(inspectorComponent.variant) || "default"}
                options={[
                  { value: "default", label: "default" },
                  { value: "subtle", label: "subtle" },
                ]}
                onChange={(value) => void updateInspector("component", { variant: value })}
                className="w-full"
              />
            </div>
          ) : null}

          {!selectionInspector.blockType ? (
            <p className="text-xs text-muted-foreground">
              {t("content_pages:EDITOR_V2_SELECT_HINT", {
                defaultValue: "Select a block in the canvas to edit component settings.",
              })}
            </p>
          ) : null}
        </Space>
      ),
    },
    {
      key: "design",
      label: t("content_pages:EDITOR_V2_RIGHT_TAB_DESIGN", { defaultValue: "Design" }),
      children: (
        <Space direction="vertical" size={10} className="w-full">
          <div>
            <div className="mb-1 text-xs text-muted-foreground">
              {t("content_pages:EDITOR_V2_FIELD_BG_COLOR", { defaultValue: "Background" })}
            </div>
            <Input
              value={toStringValue(inspectorDesign.backgroundColor)}
              onChange={(event) =>
                void updateInspector("design", {
                  backgroundColor: event.target.value,
                })
              }
              placeholder="#ffffff"
            />
          </div>
          <div>
            <div className="mb-1 text-xs text-muted-foreground">
              {t("content_pages:EDITOR_V2_FIELD_TEXT_COLOR", { defaultValue: "Text color" })}
            </div>
            <Input
              value={toStringValue(inspectorDesign.color)}
              onChange={(event) =>
                void updateInspector("design", {
                  color: event.target.value,
                })
              }
              placeholder="#111827"
            />
          </div>
          <div>
            <div className="mb-1 text-xs text-muted-foreground">
              {t("content_pages:EDITOR_V2_FIELD_BORDER_RADIUS", { defaultValue: "Border radius" })}
            </div>
            <Input
              value={toStringValue(inspectorDesign.borderRadius)}
              onChange={(event) =>
                void updateInspector("design", {
                  borderRadius: event.target.value,
                })
              }
            />
          </div>
          <div>
            <div className="mb-1 text-xs text-muted-foreground">
              {t("content_pages:EDITOR_V2_FIELD_OPACITY", { defaultValue: "Opacity" })}
            </div>
            <InputNumber
              min={0}
              max={1}
              step={0.05}
              value={toNumberValue(inspectorDesign.opacity)}
              onChange={(value) => {
                if (typeof value !== "number") return;
                void updateInspector("design", { opacity: value });
              }}
              className="w-full"
            />
          </div>
        </Space>
      ),
    },
    {
      key: "layout",
      label: t("content_pages:EDITOR_V2_RIGHT_TAB_LAYOUT", { defaultValue: "Layout" }),
      children: (
        <Space direction="vertical" size={10} className="w-full">
          <div>
            <div className="mb-1 text-xs text-muted-foreground">
              {t("content_pages:EDITOR_V2_FIELD_GAP", { defaultValue: "Gap" })}
            </div>
            <Input
              value={toStringValue(inspectorLayout.gap)}
              onChange={(event) => void updateInspector("layout", { gap: event.target.value })}
            />
          </div>
          <div>
            <div className="mb-1 text-xs text-muted-foreground">
              {t("content_pages:EDITOR_V2_FIELD_PADDING", { defaultValue: "Padding" })}
            </div>
            <Input
              value={toStringValue(inspectorLayout.padding)}
              onChange={(event) => void updateInspector("layout", { padding: event.target.value })}
            />
          </div>
          <div>
            <div className="mb-1 text-xs text-muted-foreground">
              {t("content_pages:EDITOR_V2_FIELD_DISPLAY", { defaultValue: "Display" })}
            </div>
            <Select
              value={toStringValue(inspectorLayout.display) || "block"}
              options={[
                { value: "block", label: "block" },
                { value: "flex", label: "flex" },
              ]}
              onChange={(value) => void updateInspector("layout", { display: value })}
              className="w-full"
            />
          </div>
          <div>
            <div className="mb-1 text-xs text-muted-foreground">
              {t("content_pages:EDITOR_V2_FIELD_DIRECTION", { defaultValue: "Direction" })}
            </div>
            <Select
              value={toStringValue(inspectorLayout.direction) || "column"}
              options={[
                { value: "row", label: "row" },
                { value: "column", label: "column" },
              ]}
              onChange={(value) => void updateInspector("layout", { direction: value })}
              className="w-full"
            />
          </div>
        </Space>
      ),
    },
    {
      key: "animation",
      label: t("content_pages:EDITOR_V2_RIGHT_TAB_ANIMATION", { defaultValue: "Animation" }),
      children: (
        <Space direction="vertical" size={10} className="w-full">
          <div>
            <div className="mb-1 text-xs text-muted-foreground">
              {t("content_pages:EDITOR_V2_FIELD_ANIMATION_TYPE", { defaultValue: "Type" })}
            </div>
            <Select
              value={toStringValue(inspectorAnimation.type) || "none"}
              options={[
                { value: "none", label: "none" },
                { value: "fade", label: "fade" },
                { value: "slide-up", label: "slide-up" },
                { value: "slide-down", label: "slide-down" },
                { value: "zoom-in", label: "zoom-in" },
              ]}
              onChange={(value) => void updateInspector("animation", { type: value })}
              className="w-full"
            />
          </div>
          <div>
            <div className="mb-1 text-xs text-muted-foreground">
              {t("content_pages:EDITOR_V2_FIELD_ANIMATION_TRIGGER", { defaultValue: "Trigger" })}
            </div>
            <Select
              value={toStringValue(inspectorAnimation.trigger) || "load"}
              options={[
                { value: "load", label: "load" },
                { value: "hover", label: "hover" },
              ]}
              onChange={(value) => void updateInspector("animation", { trigger: value })}
              className="w-full"
            />
          </div>
          <div>
            <div className="mb-1 text-xs text-muted-foreground">
              {t("content_pages:EDITOR_V2_FIELD_ANIMATION_DURATION", {
                defaultValue: "Duration (ms)",
              })}
            </div>
            <InputNumber
              min={0}
              step={20}
              value={toNumberValue(inspectorAnimation.durationMs)}
              onChange={(value) => {
                if (typeof value !== "number") return;
                void updateInspector("animation", { durationMs: value });
              }}
              className="w-full"
            />
          </div>
          <div>
            <div className="mb-1 text-xs text-muted-foreground">
              {t("content_pages:EDITOR_V2_FIELD_ANIMATION_DELAY", { defaultValue: "Delay (ms)" })}
            </div>
            <InputNumber
              min={0}
              step={20}
              value={toNumberValue(inspectorAnimation.delayMs)}
              onChange={(value) => {
                if (typeof value !== "number") return;
                void updateInspector("animation", { delayMs: value });
              }}
              className="w-full"
            />
          </div>
        </Space>
      ),
    },
  ];

  const renderLayers = React.useCallback(
    (nodes: EditorLayerNode[], depth = 0): React.ReactNode => {
      return nodes.map((node) => (
        <div key={node.id}>
          <button
            type="button"
            onClick={() => {
              setSelectedBlockId(node.id);
              void portalRef.current?.selectBlock({ blockId: node.id });
            }}
            className={`w-full rounded px-2 py-1 text-left text-xs ${
              selectedBlockId === node.id ? "bg-blue-500/10 text-blue-600" : "hover:bg-muted"
            }`}
            style={{ paddingLeft: `${8 + depth * 14}px` }}
          >
            {node.label}
          </button>
          {node.children.length ? <div>{renderLayers(node.children, depth + 1)}</div> : null}
        </div>
      ));
    },
    [selectedBlockId],
  );

  const renderLeftPanelContent = () => {
    if (leftPanelKey === "elements") {
      return (
        <div className="flex flex-col gap-2">
          <Button onClick={() => void insertBlock("container")}>Container</Button>
          <Button onClick={() => void insertBlock("heading")}>Heading</Button>
          <Button onClick={() => void insertBlock("paragraph")}>Paragraph</Button>
          <Button onClick={() => void insertBlock("divider")}>Divider</Button>
        </div>
      );
    }

    if (leftPanelKey === "layers") {
      return <div className="flex flex-col gap-1">{renderLayers(layerTree)}</div>;
    }

    if (leftPanelKey === "assets") {
      return (
        <div className="flex flex-col gap-2">
          {(assetsQuery.data?.items ?? []).map((asset) => (
            <div key={asset.id} className="rounded border px-2 py-1 text-xs">
              {asset.title || asset.originalFilename || asset.id}
            </div>
          ))}
          {!assetsQuery.data?.items?.length ? (
            <span className="text-xs text-muted-foreground">
              {t("content_pages:EDITOR_V2_EMPTY_ASSETS", { defaultValue: "No assets found." })}
            </span>
          ) : null}
        </div>
      );
    }

    if (leftPanelKey === "pages") {
      return (
        <div className="flex flex-col gap-1">
          {flatPages.map((page) => (
            <button
              key={page.id}
              type="button"
              className="w-full rounded px-2 py-1 text-left text-xs hover:bg-muted"
              style={{ paddingLeft: `${8 + page.depth * 14}px` }}
              onClick={() => {
                void navigate({
                  to: "/w/$workspaceId/editor/$editorMode/$entityId",
                  params: {
                    workspaceId,
                    editorMode: "page",
                    entityId: page.id,
                  },
                  search: { pathname: page.path },
                });
              }}
            >
              {page.title}
            </button>
          ))}
        </div>
      );
    }

    if (leftPanelKey === "sitemap") {
      return (
        <div className="flex flex-col gap-1 text-xs">
          {visualSitemapQuery.data?.nodes?.map((node) => (
            <div key={node.id} className="rounded border px-2 py-1">
              {node.title} <span className="text-muted-foreground">{node.path}</span>
            </div>
          ))}
          {!visualSitemapQuery.data?.nodes?.length ? (
            <span className="text-muted-foreground">
              {t("content_pages:EDITOR_V2_EMPTY_SITEMAP", {
                defaultValue: "No sitemap nodes available.",
              })}
            </span>
          ) : null}
        </div>
      );
    }

    if (leftPanelKey === "styles") {
      return (
        <div className="flex flex-col gap-2">
          <div>
            <div className="mb-1 text-xs text-muted-foreground">
              {t("content_pages:EDITOR_V2_SITE_STYLE_PRIMARY", { defaultValue: "Primary color" })}
            </div>
            <Input
              value={toStringValue(styleDraft.colorPrimary)}
              onChange={(event) =>
                setStyleDraft((prev) => ({
                  ...prev,
                  colorPrimary: event.target.value,
                }))
              }
            />
          </div>
          <div>
            <div className="mb-1 text-xs text-muted-foreground">
              {t("content_pages:EDITOR_V2_SITE_STYLE_BACKGROUND", {
                defaultValue: "Background color",
              })}
            </div>
            <Input
              value={toStringValue(styleDraft.backgroundColor)}
              onChange={(event) =>
                setStyleDraft((prev) => ({
                  ...prev,
                  backgroundColor: event.target.value,
                }))
              }
            />
          </div>
          <Button
            loading={upsertStyleMutation.isPending}
            onClick={() => upsertStyleMutation.mutate()}
          >
            {t("content_pages:EDITOR_V2_STYLE_SAVE", { defaultValue: "Save style" })}
          </Button>
        </div>
      );
    }

    if (leftPanelKey === "global_sections") {
      return (
        <div className="flex flex-col gap-2">
          <Button
            loading={createGlobalSectionMutation.isPending}
            onClick={() => createGlobalSectionMutation.mutate()}
          >
            {t("content_pages:EDITOR_V2_GLOBAL_SECTION_CREATE", { defaultValue: "Create section" })}
          </Button>
          {(globalSectionsQuery.data?.items ?? []).map((section) => (
            <div key={section.id} className="rounded border p-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-medium">{section.name}</div>
                <Space size={4}>
                  <Switch
                    size="small"
                    checked={section.enabled}
                    onChange={(checked) => {
                      void patchWorkspaceSiteGlobalSection(workspaceId, section.id, {
                        enabled: checked,
                      })
                        .then(() => {
                          void queryClient.invalidateQueries({
                            queryKey: ["workspace", workspaceId, "editor", "global-sections"],
                          });
                        })
                        .catch((err) => notifyErrorText(getErrorMessage(err)));
                    }}
                  />
                  <Button
                    size="small"
                    danger
                    onClick={() => {
                      void deleteWorkspaceSiteGlobalSection(workspaceId, section.id)
                        .then(() => {
                          void queryClient.invalidateQueries({
                            queryKey: ["workspace", workspaceId, "editor", "global-sections"],
                          });
                        })
                        .catch((err) => notifyErrorText(getErrorMessage(err)));
                    }}
                  >
                    {t("common:DELETE")}
                  </Button>
                </Space>
              </div>
              <div className="mt-1 text-caption text-label-secondary">{section.kind}</div>
            </div>
          ))}
        </div>
      );
    }

    return null;
  };

  React.useEffect(() => {
    if (editorViewMode === "preview") {
      setChildOverlayMode("off");
      return;
    }

    setChildOverlayMode("edit");
  }, [editorViewMode, setChildOverlayMode]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="border-b bg-card px-3 py-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Dropdown menu={{ items: logoMenuItems }} trigger={["click"]}>
              <Button type="text" className="!h-9 !px-2">
                <span className="flex items-center gap-2">
                  <img src="/logo.svg" alt="Celestial" className="h-5 w-5" />
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </span>
              </Button>
            </Dropdown>

            <Select
              className="min-w-[280px]"
              value={selectedPageValue}
              placeholder={t("content_pages:EDITOR_V2_MENU_PAGE_SWITCH", { defaultValue: "Pages" })}
              onChange={onSelectPage}
              open={pagePickerOpen}
              showSearch={false}
              popupMatchSelectWidth={360}
              onDropdownVisibleChange={(open) => {
                setPagePickerOpen(open);
                if (!open) setPagePickerKeyword("");
              }}
              optionRender={(option) => {
                const data = option.data as PagePickerOption;
                if (data.emptyState) {
                  return <div className="py-1 text-xs text-muted-foreground">{data.label}</div>;
                }

                const titlePrefix = data.depth > 0 ? `${"— ".repeat(data.depth)}` : "";
                return (
                  <div className="flex items-center justify-between gap-3 py-1">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">{`${titlePrefix}${data.title}`}</div>
                      <div className="truncate text-xs text-muted-foreground">{data.path}</div>
                    </div>
                    {data.isCurrent ? (
                      <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-caption font-medium text-blue-600">
                        {t("content_pages:EDITOR_V2_PAGE_PICKER_CURRENT", {
                          defaultValue: "Current",
                        })}
                      </span>
                    ) : null}
                  </div>
                );
              }}
              popupRender={(originNode) => (
                <div className="flex flex-col">
                  <div className="border-b p-2">
                    <Input
                      size="small"
                      allowClear
                      value={pagePickerKeyword}
                      prefix={<Search className="h-4 w-4 text-muted-foreground" />}
                      placeholder={t("content_pages:EDITOR_V2_PAGE_PICKER_SEARCH_PLACEHOLDER", {
                        defaultValue: "Search pages",
                      })}
                      onChange={(event) => setPagePickerKeyword(event.target.value)}
                      onKeyDown={(event) => event.stopPropagation()}
                    />
                  </div>
                  <div className="max-h-[320px] overflow-y-auto">{originNode}</div>
                  <div className="border-t p-2">
                    <Button
                      type="text"
                      className="w-full justify-start"
                      icon={<Plus className="h-4 w-4" />}
                      onClick={onOpenPagesDashboard}
                    >
                      {t("content_pages:ACTION_CREATE_PAGE", { defaultValue: "Create page" })}
                    </Button>
                  </div>
                </div>
              )}
            >
              {pagePickerGroups.map((group) => (
                <SelectOptGroup key={group.key} label={group.label}>
                  {group.options.map((option) => (
                    <SelectOption
                      key={option.value}
                      value={option.value}
                      label={option.label}
                      title={option.title}
                      path={option.path}
                      depth={option.depth}
                      groupKey={option.groupKey}
                      isCurrent={option.isCurrent}
                      disabled={option.disabled}
                      emptyState={option.emptyState}
                    >
                      {option.label}
                    </SelectOption>
                  ))}
                </SelectOptGroup>
              ))}
            </Select>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Space.Compact>
              <Tooltip
                title={t("content_pages:EDITOR_V2_DEVICE_DESKTOP", { defaultValue: "Desktop" })}
              >
                <Button
                  size="small"
                  type={devicePreset === "desktop" ? "primary" : "default"}
                  icon={<Monitor className="h-4 w-4" />}
                  onClick={() => void applyDevicePreset("desktop")}
                />
              </Tooltip>

              <Tooltip
                title={t("content_pages:EDITOR_V2_DEVICE_TABLET", { defaultValue: "Tablet" })}
              >
                <Button
                  size="small"
                  type={devicePreset === "tablet" ? "primary" : "default"}
                  icon={<Tablet className="h-4 w-4" />}
                  onClick={() => void applyDevicePreset("tablet")}
                />
              </Tooltip>

              <Tooltip
                title={t("content_pages:EDITOR_V2_DEVICE_MOBILE", { defaultValue: "Mobile" })}
              >
                <Button
                  size="small"
                  type={devicePreset === "mobile" ? "primary" : "default"}
                  icon={<Smartphone className="h-4 w-4" />}
                  onClick={() => void applyDevicePreset("mobile")}
                />
              </Tooltip>
            </Space.Compact>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  size="small"
                  icon={<Monitor className="h-4 w-4" />}
                >{`${zoomPercent}%`}</Button>
              </PopoverTrigger>
              <PopoverContent align="center" sideOffset={8} className="w-[300px] p-3">
                <div className="space-y-3">
                  <div className="text-xs font-medium text-muted-foreground">
                    {t("content_pages:EDITOR_V2_CANVAS_SIZE_POPOVER_TITLE", {
                      defaultValue: "Canvas zoom",
                    })}
                  </div>

                  <Space.Compact className="w-full">
                    <Button
                      size="small"
                      icon={<Minus className="h-4 w-4" />}
                      onClick={() => void applyZoom(zoomPercent - 10)}
                    />
                    <InputNumber
                      size="small"
                      value={zoomPercent}
                      min={25}
                      max={200}
                      addonAfter="%"
                      controls={false}
                      className="w-full"
                      onChange={(value) => {
                        if (typeof value !== "number") return;
                        void applyZoom(value);
                      }}
                    />
                    <Button
                      size="small"
                      icon={<ZoomIn className="h-4 w-4" />}
                      onClick={() => void applyZoom(zoomPercent + 10)}
                    />
                  </Space.Compact>

                  <Button
                    size="small"
                    type="text"
                    className="px-0"
                    onClick={() => void applyZoom(100)}
                  >
                    {t("content_pages:EDITOR_V2_VIEWS_ZOOM_RESET", { defaultValue: "Reset zoom" })}
                  </Button>

                  <Divider className="!my-2" />

                  <div className="text-xs font-medium text-muted-foreground">
                    {t("content_pages:EDITOR_V2_CANVAS_SIZE_SIZING_MODE", {
                      defaultValue: "Canvas sizing mode",
                    })}
                  </div>

                  <Space.Compact className="w-full">
                    <Button
                      size="small"
                      className="w-1/2"
                      type={canvasPreferences.sizingMode === "fit" ? "primary" : "default"}
                      onClick={() => void setCanvasSizingMode("fit")}
                    >
                      {t("content_pages:EDITOR_V2_CANVAS_SIZE_MODE_FIT", { defaultValue: "Fit" })}
                    </Button>
                    <Button
                      size="small"
                      className="w-1/2"
                      type={canvasPreferences.sizingMode === "fixed" ? "primary" : "default"}
                      onClick={() => void setCanvasSizingMode("fixed")}
                    >
                      {t("content_pages:EDITOR_V2_CANVAS_SIZE_MODE_FIXED", {
                        defaultValue: "Fixed",
                      })}
                    </Button>
                  </Space.Compact>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex items-center gap-2">
            <Tooltip title={bridgeStatusText}>
              <span
                className={`mx-1 h-2.5 w-2.5 rounded-full ${
                  bridgeStatus === "connected"
                    ? "bg-emerald-500"
                    : bridgeStatus === "connecting"
                      ? "bg-blue-500"
                      : "bg-muted-foreground/50"
                }`}
              />
            </Tooltip>

            <Space.Compact>
              <Tooltip
                title={`${t("content_pages:EDITOR_V2_ACTION_UNDO", { defaultValue: "Undo" })} (${SHORTCUT_HINTS.undo})`}
              >
                <Button
                  size="small"
                  icon={<Undo2 className="h-4 w-4" />}
                  disabled={!canUndo}
                  onClick={() => void onUndo()}
                />
              </Tooltip>
              <Tooltip
                title={`${t("content_pages:EDITOR_V2_ACTION_REDO", { defaultValue: "Redo" })} (${SHORTCUT_HINTS.redo})`}
              >
                <Button
                  size="small"
                  icon={<Redo2 className="h-4 w-4" />}
                  disabled={!canRedo}
                  onClick={() => void onRedo()}
                />
              </Tooltip>
            </Space.Compact>

            <Space.Compact>
              <Tooltip
                title={t("content_pages:EDITOR_V2_MODE_EDIT", { defaultValue: "Edit mode" })}
              >
                <Button
                  size="small"
                  type={editorViewMode === "edit" ? "primary" : "default"}
                  icon={<PencilLine className="h-4 w-4" />}
                  onClick={() => setEditorViewMode("edit")}
                />
              </Tooltip>
              <Tooltip
                title={t("content_pages:EDITOR_V2_MODE_PREVIEW", { defaultValue: "Preview mode" })}
              >
                <Button
                  size="small"
                  type={editorViewMode === "preview" ? "primary" : "default"}
                  icon={<Eye className="h-4 w-4" />}
                  onClick={() => setEditorViewMode("preview")}
                />
              </Tooltip>
            </Space.Compact>

            <Tooltip title={t("content_pages:EDITOR_SHELL_SAVE_SHORTCUT_HINT")}>
              <Button
                loading={saveStatus === "saving"}
                disabled={saveDisabled}
                onClick={onSaveFromHeader}
              >
                {t("content_pages:EDITOR_SHELL_ACTION_SAVE")}
              </Button>
            </Tooltip>
            <Button
              type="primary"
              loading={publishStatus === "publishing"}
              disabled={publishDisabled}
              onClick={onPublish}
            >
              {t("content_pages:EDITOR_SHELL_ACTION_PUBLISH")}
            </Button>
          </div>
        </div>
      </header>

      {pageDetailQuery.error ? (
        <Alert
          type="error"
          showIcon
          message={t("content_pages:EDITOR_SHELL_PAGE_LOAD_ERROR")}
          description={getErrorMessage(pageDetailQuery.error)}
        />
      ) : null}

      {bridgeError ? (
        <Alert
          type="warning"
          showIcon
          message={t("content_pages:EDITOR_SHELL_BRIDGE_ERROR")}
          description={bridgeError}
        />
      ) : null}

      {saveError ? (
        <Alert
          type="error"
          showIcon
          message={t("content_pages:EDITOR_SHELL_SAVE_ERROR")}
          description={saveError}
        />
      ) : null}

      {publishError ? (
        <Alert
          type="error"
          showIcon
          message={t("content_pages:EDITOR_SHELL_PUBLISH_ERROR")}
          description={publishError}
        />
      ) : null}

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <aside className="flex w-[56px] shrink-0 flex-col gap-1 border-r bg-card p-1">
          {leftMenuItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`rounded px-2 py-2 text-left text-caption ${
                item.key === leftPanelKey ? "bg-blue-500/10 text-blue-600" : "hover:bg-muted"
              }`}
              onClick={() => setLeftPanelKey(item.key)}
            >
              {item.label.slice(0, 2)}
            </button>
          ))}
        </aside>

        <aside className="w-[300px] shrink-0 border-r bg-card p-3">
          <div className="mb-3 text-sm font-semibold">
            {leftMenuItems.find((item) => item.key === leftPanelKey)?.label}
          </div>
          <div className="h-[calc(100%-28px)] overflow-auto">{renderLeftPanelContent()}</div>
        </aside>

        <main className="min-w-0 flex-1 bg-[#e9edf3] p-3">
          <WorkspaceEditorIframe
            workspaceId={workspaceId}
            pathname={pathname}
            onPathnameChange={setPathname}
            portalOrigin={portalOrigin}
            onIframeRefChange={setIframeElement}
            hideToolbar
            canvasWidthPx={DEVICE_WIDTH[devicePreset]}
            zoomPercent={zoomPercent}
            showBounds={canvasPreferences.showBounds}
            showGuides={canvasPreferences.showGuides}
          />
        </main>

        <aside className="w-[320px] shrink-0 border-l bg-card p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold">
                {t("content_pages:EDITOR_V2_RIGHT_TITLE", { defaultValue: "Inspector" })}
              </div>
              <div className="text-xs text-muted-foreground">
                {selectionInspector.blockId ||
                  t("content_pages:EDITOR_V2_SELECT_HINT_SHORT", {
                    defaultValue: "No block selected",
                  })}
              </div>
            </div>
          </div>

          <Tabs items={inspectorTabs} />

          <Divider className="my-3" />

          <div className="space-y-1 text-xs text-muted-foreground">
            <div>{`${t("content_pages:EDITOR_SHELL_PING_LABEL")} ${lastPingRttMs ?? t("content_pages:PLACEHOLDER_DASH")}`}</div>
            <div>{`${t("content_pages:EDITOR_SHELL_SAVE_LABEL")} ${saveText}`}</div>
            <div>{`${t("content_pages:EDITOR_SHELL_PUBLISH_LABEL")} ${publishText}`}</div>
            <div>{`${t("content_pages:EDITOR_SHELL_DRAFT_REV_LABEL")} ${lastSavedRevision ?? t("content_pages:PLACEHOLDER_DASH")}`}</div>
            <div>{`${t("content_pages:EDITOR_SHELL_PUBLISHED_REV_LABEL")} ${lastPublishedRevision ?? t("content_pages:PLACEHOLDER_DASH")}`}</div>
            <div>{`${t("content_pages:EDITOR_SHELL_PRESENCE_LABEL")} ${presenceTime}`}</div>
            <div>{`${t("content_pages:EDITOR_SHELL_DRAFT_OVERRIDE_LABEL")} ${hasDraftOverride ? t("content_pages:EDITOR_SHELL_VALUE_YES") : t("content_pages:EDITOR_SHELL_VALUE_NO")}`}</div>
            {lastPingError ? (
              <div className="text-destructive">{`${t("content_pages:EDITOR_SHELL_PING_ERROR")}${lastPingError}`}</div>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
