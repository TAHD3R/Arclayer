interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface DndOverlayProps {
  active: boolean;
  position?: "before" | "after" | "inside";
  targetRect?: TargetRect | null;
}

export function DndOverlay({ active, position, targetRect }: DndOverlayProps) {
  if (!active || !targetRect) return null;

  const base = "pointer-events-none fixed z-50";

  if (position === "inside") {
    return <div className={`${base} border-2 border-blue-500 rounded`} style={targetRect} />;
  }

  const top = position === "after" ? targetRect.top + targetRect.height : targetRect.top;

  return (
    <div
      className={`${base} h-0.5 bg-blue-500`}
      style={{ top, left: targetRect.left, width: targetRect.width }}
    />
  );
}
