import { useRef } from "react";
import { motion } from "motion/react";
import { useDroppable } from "@dnd-kit/core";
import { Hand, MousePointer2, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { DevicePreset } from "@/pages/workspaces/editor/stores/editor-store";
import { useEditorStore } from "@/pages/workspaces/editor/stores/editor-store";
import { useCanvasPanZoom } from "@/pages/workspaces/editor/hooks/use-canvas-pan-zoom";
import { DEVICE_PRESET_WIDTHS } from "@/pages/workspaces/editor/constants/canvas";
import { cn } from "@/lib/utils";
import { EDITOR_CANVAS_DROPPABLE_ID } from "@/pages/workspaces/editor/contexts/editor-dnd-context";
import { useEditorActions } from "@/pages/workspaces/editor/hooks/use-editor-actions";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";

type CanvasProps = {
  iframeSrc: string;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  isLoading: boolean;
  loadError: string | null;
};

export function Canvas({ iframeSrc, iframeRef, isLoading, loadError }: CanvasProps) {
  const { t } = useTranslation(["content_pages"]);
  const containerRef = useRef<HTMLElement>(null);

  const devicePreset = useEditorStore((s) => s.devicePreset) as DevicePreset;
  const canvasWidth = useEditorStore((s) => s.canvasWidth);
  const panX = useEditorStore((s) => s.canvasPanX);
  const panY = useEditorStore((s) => s.canvasPanY);

  const { transformStyle, containerHandlers, cursor } = useCanvasPanZoom(containerRef);
  const actions = useEditorActions();
  const { setNodeRef, isOver } = useDroppable({ id: EDITOR_CANVAS_DROPPABLE_ID });

  // 视口宽度：优先使用自定义宽度，否则按设备预设
  const displayWidth = canvasWidth ?? DEVICE_PRESET_WIDTHS[devicePreset] ?? 1440;
  const cursorClassName =
    cursor === "grab"
      ? "cursor-grab"
      : cursor === "grabbing"
        ? "cursor-grabbing"
        : "cursor-default";

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <main
          ref={(node) => {
            containerRef.current = node;
            setNodeRef(node);
          }}
          className={cn(
            "relative min-w-0 flex-1 overflow-hidden canvas-bg",
            cursorClassName,
            isOver ? "ring-1 ring-foreground/20" : null,
          )}
          {...containerHandlers}
        >
          {/* 点阵背景（跟随 pan 偏移） */}
          <div
            className="pointer-events-none absolute inset-0 canvas-dot-grid"
            style={{ backgroundPosition: `${panX}px ${panY}px` }}
          />

          {loadError ? (
            <div className="flex h-full items-center justify-center p-8">
              <p className="text-footnote text-destructive">{loadError}</p>
            </div>
          ) : isLoading ? (
            <div className="flex h-full items-center justify-center">
              <div className="size-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
            </div>
          ) : iframeSrc ? (
            <div className="absolute left-1/2 top-12" style={transformStyle}>
              <motion.div
                animate={{ width: displayWidth }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="relative -translate-x-1/2 bg-white shadow-lg dark:bg-zinc-900"
              >
                {/* Hand tool / Space-panning overlay: capture pointer events above the iframe so panning works. */}
                {cursor !== "default" ? <div className="absolute inset-0 z-10" /> : null}
                <iframe
                  ref={iframeRef}
                  title="editor-canvas"
                  src={iframeSrc}
                  className="pointer-events-auto min-h-screen w-full border-0"
                />
              </motion.div>
            </div>
          ) : null}
        </main>
      </ContextMenuTrigger>

      <ContextMenuContent>
        <ContextMenuItem onSelect={() => void actions.run("tool.select")}>
          <MousePointer2 className="mr-2 size-4" />
          {t("content_pages:EDITOR_TOOLBAR_TOOL_SELECT")}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => void actions.run("tool.hand")}>
          <Hand className="mr-2 size-4" />
          {t("content_pages:EDITOR_TOOLBAR_TOOL_HAND")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => void actions.run("view.zoom_in")}>
          <ZoomIn className="mr-2 size-4" />
          {t("content_pages:EDITOR_TOOLBAR_ZOOM_IN")}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => void actions.run("view.zoom_out")}>
          <ZoomOut className="mr-2 size-4" />
          {t("content_pages:EDITOR_TOOLBAR_ZOOM_OUT")}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => void actions.run("view.zoom_reset")}>
          <RotateCcw className="mr-2 size-4" />
          {t("content_pages:EDITOR_TOOLBAR_ZOOM_RESET")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
