import { useRef } from "react";
import { motion } from "motion/react";

import type { DevicePreset } from "@/pages/workspaces/editor/stores/editor-store";
import { useEditorStore } from "@/pages/workspaces/editor/stores/editor-store";
import { useCanvasPanZoom } from "@/pages/workspaces/editor/hooks/use-canvas-pan-zoom";
import { DEVICE_PRESET_WIDTHS } from "@/pages/workspaces/editor/constants/canvas";
import { cn } from "@/lib/utils";

type CanvasProps = {
  iframeSrc: string;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  isLoading: boolean;
  loadError: string | null;
};

export function Canvas({ iframeSrc, iframeRef, isLoading, loadError }: CanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const devicePreset = useEditorStore((s) => s.devicePreset) as DevicePreset;
  const canvasWidth = useEditorStore((s) => s.canvasWidth);
  const panX = useEditorStore((s) => s.canvasPanX);
  const panY = useEditorStore((s) => s.canvasPanY);

  const { transformStyle, containerHandlers, cursor } = useCanvasPanZoom(containerRef);

  // 视口宽度：优先使用自定义宽度，否则按设备预设
  const displayWidth = canvasWidth ?? DEVICE_PRESET_WIDTHS[devicePreset] ?? 1440;
  const cursorClassName =
    cursor === "grab"
      ? "cursor-grab"
      : cursor === "grabbing"
        ? "cursor-grabbing"
        : "cursor-default";

  return (
    <main
      ref={containerRef}
      className={cn("relative min-w-0 flex-1 overflow-hidden canvas-bg", cursorClassName)}
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
  );
}
