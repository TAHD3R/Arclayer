import { useRef } from "react";
import { motion } from "motion/react";

import { useEditorStore } from "@/pages/workspaces/editor/stores/editor-store";
import { useCanvasPanZoom } from "@/pages/workspaces/editor/hooks/use-canvas-pan-zoom";

const DEVICE_NUMERIC_WIDTHS: Record<string, number> = {
  desktop: 1440,
  tablet: 768,
  mobile: 375,
};

type CanvasProps = {
  iframeSrc: string;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  isLoading: boolean;
  loadError: string | null;
};

export function Canvas({ iframeSrc, iframeRef, isLoading, loadError }: CanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const devicePreset = useEditorStore((s) => s.devicePreset);
  const canvasWidth = useEditorStore((s) => s.canvasWidth);
  const panX = useEditorStore((s) => s.canvasPanX);
  const panY = useEditorStore((s) => s.canvasPanY);

  const { transformStyle, containerHandlers, cursor } = useCanvasPanZoom(containerRef);

  // 视口宽度：优先使用自定义宽度，否则按设备预设
  const displayWidth = canvasWidth ?? DEVICE_NUMERIC_WIDTHS[devicePreset] ?? 1440;

  return (
    <main
      ref={containerRef}
      className="relative min-w-0 flex-1 overflow-hidden canvas-bg"
      style={{ cursor }}
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
            className="relative bg-white shadow-lg dark:bg-zinc-900"
            style={{ marginLeft: `-${displayWidth / 2}px` }}
          >
            <iframe
              ref={iframeRef}
              title="editor-canvas"
              src={iframeSrc}
              className="pointer-events-auto h-full w-full border-0"
              style={{ minHeight: "100vh" }}
            />
          </motion.div>
        </div>
      ) : null}
    </main>
  );
}
