import { useCallback, useEffect, useRef, useState } from "react";

import { useEditorStore } from "@/pages/workspaces/editor/stores/editor-store";
import { isSpaceKeyReservedTarget } from "@/pages/workspaces/editor/hooks/editor-keyboard";

// 缩放范围与步进常量
const MIN_ZOOM = 25;
const MAX_ZOOM = 200;
const ZOOM_STEP = 5;
// 进入平移的最小拖拽距离（px），避免轻微抖动导致误触发。
const PAN_ACTIVATION_DISTANCE_PX = 3;

interface CanvasPanZoomReturn {
  transformStyle: React.CSSProperties;
  startPanHandlers: {
    onPointerDown: (e: React.PointerEvent) => void;
  };
  isPanning: boolean;
  spaceHeld: boolean;
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
  type PanStartReason = "hand" | "space" | "middle";
  const panSessionRef = useRef<{
    pointerId: number | null;
    reason: PanStartReason | null;
    startClientX: number;
    startClientY: number;
    startPanX: number;
    startPanY: number;
    isPending: boolean;
    hasActivated: boolean;
  }>({
    pointerId: null,
    reason: null,
    startClientX: 0,
    startClientY: 0,
    startPanX: 0,
    startPanY: 0,
    isPending: false,
    hasActivated: false,
  });
  const spaceHeldRef = useRef(false);
  const [isPanning, setIsPanning] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);

  // 用 ref 缓存最新 store 值，供 wheel 回调读取（避免闭包过期）
  const storeRef = useRef({ zoomPercent, panX, panY });
  storeRef.current = { zoomPercent, panX, panY };

  const forceStopPanning = useCallback(() => {
    const s = panSessionRef.current;
    if (s.pointerId == null) return;

    panSessionRef.current = {
      pointerId: null,
      reason: null,
      startClientX: 0,
      startClientY: 0,
      startPanX: 0,
      startPanY: 0,
      isPending: false,
      hasActivated: false,
    };
    setIsPanning(false);
  }, []);

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

  // --- 全局监听：平移期间持续接管 move/up/cancel（不依赖 pointer capture，避免泄漏影响全局点击） ---
  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const s = panSessionRef.current;
      if (s.pointerId == null) return;
      if (e.pointerId !== s.pointerId) return;

      const dx = e.clientX - s.startClientX;
      const dy = e.clientY - s.startClientY;

      // 未超过阈值前保持 pending，避免轻微抖动误触发。
      if (s.isPending && !s.hasActivated) {
        const dist2 = dx * dx + dy * dy;
        if (dist2 < PAN_ACTIVATION_DISTANCE_PX * PAN_ACTIVATION_DISTANCE_PX) return;
        s.isPending = false;
        s.hasActivated = true;
        setIsPanning(true);
      }

      if (!s.hasActivated) return;
      e.preventDefault();
      setCanvasPan(s.startPanX + dx, s.startPanY + dy);
    };

    const onPointerUp = (e: PointerEvent) => {
      const s = panSessionRef.current;
      if (s.pointerId == null) return;
      if (e.pointerId !== s.pointerId) return;
      if (s.hasActivated) e.preventDefault();
      forceStopPanning();
    };

    const onPointerCancel = (e: PointerEvent) => {
      const s = panSessionRef.current;
      if (s.pointerId == null) return;
      if (e.pointerId !== s.pointerId) return;
      forceStopPanning();
    };

    const onBlur = () => forceStopPanning();
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") forceStopPanning();
    };
    // 鼠标释放在窗口外时，pointerup/pointercancel 可能不会回到当前文档，兜底结束平移。
    const onMouseOut = (e: MouseEvent) => {
      const s = panSessionRef.current;
      if (s.pointerId == null) return;
      // relatedTarget 为空通常表示离开当前窗口/文档。
      if (e.relatedTarget != null) return;
      forceStopPanning();
    };

    // 使用 capture 阶段监听，避免某些组件 stopPropagation 造成遗漏。
    window.addEventListener("pointermove", onPointerMove, { capture: true });
    window.addEventListener("pointerup", onPointerUp, { capture: true });
    window.addEventListener("pointercancel", onPointerCancel, { capture: true });
    window.addEventListener("blur", onBlur);
    window.addEventListener("mouseout", onMouseOut, { capture: true });
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pointermove", onPointerMove, { capture: true });
      window.removeEventListener("pointerup", onPointerUp, { capture: true });
      window.removeEventListener("pointercancel", onPointerCancel, { capture: true });
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("mouseout", onMouseOut, { capture: true });
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [forceStopPanning, setCanvasPan]);

  // 切换离开 Hand 工具时强制停止，避免平移状态卡住影响其它交互。
  useEffect(() => {
    const s = panSessionRef.current;
    if (s.pointerId == null) return;
    if (s.reason !== "hand") return;
    if (activeTool === "hand") return;
    forceStopPanning();
  }, [activeTool, forceStopPanning]);

  // --- 判断是否应进入平移模式 ---
  const shouldPan = useCallback(
    (e: React.PointerEvent) => {
      // 中键拖拽：无论工具如何都允许
      if (e.button === 1) return true;
      // 其它模式只允许左键（避免右键阻塞 context-menu）
      if (e.button !== 0) return false;
      return activeTool === "hand" || spaceHeldRef.current;
    },
    [activeTool],
  );

  // --- Pointer handlers (start only) ---
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!shouldPan(e)) return;

      // 避免触发浏览器默认拖拽/选择反馈（跨域 iframe 场景会导致 not-allowed 等状态）
      e.preventDefault();
      forceStopPanning();

      const reason: PanStartReason =
        e.button === 1 ? "middle" : activeTool === "hand" ? "hand" : "space";

      // 进入 pending 状态：只有移动超过阈值才算真正开始平移（避免误触发）。
      panSessionRef.current.pointerId = e.pointerId;
      panSessionRef.current.reason = reason;
      panSessionRef.current.startClientX = e.clientX;
      panSessionRef.current.startClientY = e.clientY;
      panSessionRef.current.startPanX = storeRef.current.panX;
      panSessionRef.current.startPanY = storeRef.current.panY;
      panSessionRef.current.isPending = true;
      panSessionRef.current.hasActivated = false;
    },
    [forceStopPanning, shouldPan, activeTool],
  );

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
    startPanHandlers: {
      onPointerDown,
    },
    isPanning,
    spaceHeld,
    cursor,
  };
}
