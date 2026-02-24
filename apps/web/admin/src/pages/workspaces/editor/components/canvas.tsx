import { useEditorStore } from "@/pages/workspaces/editor/stores/editor-store";

const DEVICE_WIDTHS = {
  desktop: "100%",
  tablet: "768px",
  mobile: "375px",
} as const;

type CanvasProps = {
  iframeSrc: string;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  isLoading: boolean;
  loadError: string | null;
};

export function Canvas({ iframeSrc, iframeRef, isLoading, loadError }: CanvasProps) {
  const devicePreset = useEditorStore((s) => s.devicePreset);
  const zoomPercent = useEditorStore((s) => s.zoomPercent);

  const scale = zoomPercent / 100;
  const width = DEVICE_WIDTHS[devicePreset];
  const needsScale = scale !== 1;

  return (
    <main className="relative min-w-0 flex-1 overflow-auto bg-[#e9edf3]">
      {loadError ? (
        <div className="flex h-full items-center justify-center p-8">
          <p className="text-sm text-destructive">{loadError}</p>
        </div>
      ) : isLoading ? (
        <div className="flex h-full items-center justify-center">
          <div className="size-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        </div>
      ) : iframeSrc ? (
        <div className="flex min-h-full items-stretch">
          <div
            className="flex-1"
            style={
              needsScale
                ? { width, transform: `scale(${scale})`, transformOrigin: "top center" }
                : undefined
            }
          >
            <iframe
              ref={iframeRef}
              title="editor-canvas"
              src={iframeSrc}
              className="h-full w-full border-0"
              style={{ minHeight: "100vh" }}
            />
          </div>
        </div>
      ) : null}
    </main>
  );
}
