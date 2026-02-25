import { useCallback, useEffect, useRef, useState } from "react";

import { useEditorStore } from "@/pages/workspaces/editor/stores/editor-store";
import { isSpaceKeyReservedTarget } from "@/pages/workspaces/editor/hooks/editor-keyboard";

// 缩放范围与步进常量
const MIN_ZOOM = 25;
const MAX_ZOOM = 200;
const ZOOM_STEP = 5;

interface CanvasPanZoomReturn {
  transformStyle: React.CSSProperties;
  containerHandlers: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: (e: React.PointerEvent) => void;
  };
  isPanning: boolean;
  cursor: string;
}

/**
 * Infinite canvas pan & zoom hook.
 *
 * - Zoom: Ctrl+wheel / pinch (ctrlKey on wheel event)
 * - Pan: Hand tool drag / middle-click drag / Space+drag
 * - Transform: translate + scale, origin at 0 0
 */
export function useCanvasPanZoom(
  containerRef: React.RefObject<HTMLElement | null>,
): CanvasPanZoomReturn {
  // --- Store state ---
  const activeTool = useEditorStore((s) => s.activeTool);
  const zoomPercent = useEditorStore((s) => s.zoomPercent);
  const panX = useEditorStore((s) => s.canvasPanX);
  const panY = useEditorStore((s) => s.canvasPanY);
  const setZoomPercent = useEditorStore((s) => s.setZoomPercent);
  const setCanvasPan = useEditorStore((s) => s.setCanvasPan);

  // --- Local refs for drag state (avoid re-renders) ---
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const spaceHeldRef = useRef(false);
  const [isPanning, setIsPanning] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);

  // 用 ref 缓存最新 store 值，供 wheel 回调读取（避免闭包过期）
  const storeRef = useRef({ zoomPercent, panX, panY });
  storeRef.current = { zoomPercent, panX, panY };

  // --- Wheel zoom (passive: false to preventDefault) ---
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      // 仅 Ctrl+wheel 触发缩放（含触控板 pinch）
      if (!e.ctrlKey) return;
      e.preventDefault();

      const { zoomPercent: curZoom, panX: curPanX, panY: curPanY } = storeRef.current;
      const oldScale = curZoom / 100;

      // 计算新缩放值
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, curZoom + delta));
      const newScale = newZoom / 100;

      if (newZoom === curZoom) return;

      // 以鼠标位置为中心缩放：调整 pan 使鼠标指向的画布点保持不变
      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const newPanX = mouseX - ((mouseX - curPanX) / oldScale) * newScale;
      const newPanY = mouseY - ((mouseY - curPanY) / oldScale) * newScale;

      setZoomPercent(newZoom);
      setCanvasPan(newPanX, newPanY);
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [containerRef, setZoomPercent, setCanvasPan]);

  // --- Space key tracking ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat) {
        if (isSpaceKeyReservedTarget(e.target)) return;
        // 避免页面滚动
        e.preventDefault();
        spaceHeldRef.current = true;
        setSpaceHeld(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceHeldRef.current = false;
        setSpaceHeld(false);
      }
    };
    const handleBlur = () => {
      spaceHeldRef.current = false;
      setSpaceHeld(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  // --- 判断是否应进入平移模式 ---
  const shouldPan = useCallback(
    (e: React.PointerEvent) =>
      activeTool === "hand" ||
      e.button === 1 || // 中键拖拽
      spaceHeldRef.current,
    [activeTool],
  );

  // --- Pointer handlers ---
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!shouldPan(e)) return;

      isPanningRef.current = true;
      setIsPanning(true);
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        panX: storeRef.current.panX,
        panY: storeRef.current.panY,
      };

      // 捕获指针，确保拖拽到容器外仍能接收事件
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [shouldPan],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isPanningRef.current) return;

      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;

      setCanvasPan(panStartRef.current.panX + dx, panStartRef.current.panY + dy);
    },
    [setCanvasPan],
  );

  const stopPanning = useCallback((e: React.PointerEvent) => {
    if (!isPanningRef.current) return;

    isPanningRef.current = false;
    setIsPanning(false);

    const el = e.currentTarget as HTMLElement;
    if (el.hasPointerCapture(e.pointerId)) {
      el.releasePointerCapture(e.pointerId);
    }
  }, []);
  const onPointerUp = stopPanning;
  const onPointerCancel = stopPanning;

  // --- Transform style ---
  const scale = zoomPercent / 100;
  const transformStyle: React.CSSProperties = {
    transform: `translate(${panX}px, ${panY}px) scale(${scale})`,
    transformOrigin: "0 0",
  };

  // --- Cursor ---
  let cursor = "default";
  if (activeTool === "hand" || spaceHeld) {
    cursor = isPanning ? "grabbing" : "grab";
  }

  return {
    transformStyle,
    containerHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
    },
    isPanning,
    cursor,
  };
}
