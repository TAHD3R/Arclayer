interface OverlayRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface InlineEditOverlayProps {
  active: boolean;
  blockId: string | null;
  rect?: OverlayRect | null;
}

export function InlineEditOverlay({ active, blockId, rect }: InlineEditOverlayProps) {
  if (!active || !rect) return null;

  return (
    <div
      data-block-id={blockId}
      className="pointer-events-none fixed z-50 border-2 border-blue-500"
      style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
    >
      {/* Toolbar placeholder — pointer-events restored so buttons are clickable */}
      <div className="pointer-events-auto absolute -top-8 left-0 flex gap-1 rounded bg-blue-500 px-1 py-0.5 text-xs text-white">
        <button type="button">B</button>
        <button type="button">I</button>
        <button type="button">U</button>
      </div>
    </div>
  );
}
