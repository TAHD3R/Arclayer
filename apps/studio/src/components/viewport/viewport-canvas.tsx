import type { PointerEvent, ReactNode, RefCallback } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Segmented, Space } from "antd";
import { useTranslation } from "react-i18next";

import { useViewportStore } from "@/stores/use-viewport-store";

type ViewportCanvasProps = {
  children: ReactNode;
  scrollerRef?: RefCallback<HTMLDivElement>;
};

type DragAxis = "x" | "y";

export function ViewportCanvas(props: ViewportCanvasProps) {
  const { t } = useTranslation(["editor"]);
  const setViewport = useViewportStore((s) => s.setViewport);
  const width = useViewportStore((s) => s.width);
  const height = useViewportStore((s) => s.height);
  const mode = useViewportStore((s) => s.mode);
  const setMode = useViewportStore((s) => s.setMode);

  const scrollerElRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    dragging: boolean;
    axis: DragAxis | null;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
  }>({
    dragging: false,
    axis: null,
    startX: 0,
    startY: 0,
    startWidth: width,
    startHeight: height,
  });

  const [frameSize, setFrameSize] = useState<{ width: number; height: number }>({ width, height });

  const combinedScrollerRef = useMemo<RefCallback<HTMLDivElement>>(
    () => (node) => {
      scrollerElRef.current = node;
      props.scrollerRef?.(node);
    },
    [props.scrollerRef],
  );

  const frameStyle = {
    width: `${frameSize.width}px`,
    height: `${frameSize.height}px`,
  } as const;

  useEffect(() => {
    if (dragStateRef.current.dragging) return;
    setFrameSize({ width, height });
  }, [height, width]);

  const onPointerDownHandle = (axis: DragAxis) => (e: PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startWidth = frameSize.width;
    const startHeight = frameSize.height;
    dragStateRef.current = {
      dragging: true,
      axis,
      startX: e.clientX,
      startY: e.clientY,
      startWidth,
      startHeight,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMoveHandle = (e: PointerEvent) => {
    const s = dragStateRef.current;
    if (!s.dragging || !s.axis) return;

    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;

    if (s.axis === "x") {
      const next = Math.max(320, Math.min(1920, Math.round(s.startWidth + dx)));
      setFrameSize((prev) => (prev.width === next ? prev : { ...prev, width: next }));
      return;
    }

    const next = Math.max(480, Math.min(1400, Math.round(s.startHeight + dy)));
    setFrameSize((prev) => (prev.height === next ? prev : { ...prev, height: next }));
  };

  const onPointerUpHandle = (e: PointerEvent) => {
    const s = dragStateRef.current;
    if (!s.dragging) return;
    dragStateRef.current = { ...s, dragging: false, axis: null };
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    setViewport(frameSize.width, frameSize.height);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border bg-card px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <Space wrap>
            <Button onClick={() => setViewport(1200, 800)}>
              {t("editor:EDITOR_VIEWPORT_PRESET_DESKTOP")}
            </Button>
            <Button onClick={() => setViewport(834, 900)}>
              {t("editor:EDITOR_VIEWPORT_PRESET_TABLET")}
            </Button>
            <Button onClick={() => setViewport(390, 844)}>
              {t("editor:EDITOR_VIEWPORT_PRESET_MOBILE")}
            </Button>
          </Space>
          <Segmented
            value={mode}
            onChange={(v) => setMode(v === "preview" ? "preview" : "edit")}
            options={[
              { value: "edit", label: t("editor:EDITOR_MODE_EDIT") },
              { value: "preview", label: t("editor:EDITOR_MODE_PREVIEW") },
            ]}
          />
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center overflow-hidden bg-muted/30 p-6">
        <div className="relative">
          <div
            ref={combinedScrollerRef}
            className="relative overflow-auto rounded-md border border-border bg-background shadow-sm"
            style={frameStyle}
            onPointerMove={onPointerMoveHandle}
            onPointerUp={onPointerUpHandle}
            onPointerCancel={onPointerUpHandle}
          >
            <div className={mode === "preview" ? "" : "pointer-events-auto"}>{props.children}</div>
          </div>

          <div
            className="absolute right-[-10px] top-0 h-full w-[20px] cursor-ew-resize"
            onPointerDown={onPointerDownHandle("x")}
            onPointerMove={onPointerMoveHandle}
            onPointerUp={onPointerUpHandle}
            onPointerCancel={onPointerUpHandle}
            aria-hidden="true"
          />
          <div
            className="absolute bottom-[-10px] left-0 h-[20px] w-full cursor-ns-resize"
            onPointerDown={onPointerDownHandle("y")}
            onPointerMove={onPointerMoveHandle}
            onPointerUp={onPointerUpHandle}
            onPointerCancel={onPointerUpHandle}
            aria-hidden="true"
          />
        </div>
      </div>
    </div>
  );
}
