import { useEditorStore } from "@/pages/workspaces/editor/stores/editor-store";

const DEVICE_WIDTHS = {
  desktop: "100%",
  tablet: "768px",
  mobile: "375px",
} as const;

type CanvasProps = {
  iframeSrc?: string;
  iframeRef?: React.RefCallback<HTMLIFrameElement> | React.RefObject<HTMLIFrameElement | null>;
};

export function Canvas({ iframeSrc, iframeRef }: CanvasProps) {
  const devicePreset = useEditorStore((s) => s.devicePreset);
  const zoomPercent = useEditorStore((s) => s.zoomPercent);

  const scale = zoomPercent / 100;
  const width = DEVICE_WIDTHS[devicePreset];

  return (
    <main className="relative min-w-0 flex-1 overflow-auto bg-[#e9edf3]">
      <div className="flex min-h-full items-start justify-center p-8">
        <div
          className="rounded-xl bg-background shadow-[0_20px_60px_rgba(15,23,42,0.22)]"
          style={{
            width,
            minHeight: "100vh",
            transform: `scale(${scale})`,
            transformOrigin: "top center",
          }}
        >
          {iframeSrc ? (
            <iframe
              ref={iframeRef}
              title="editor-canvas"
              src={iframeSrc}
              className="h-full w-full border-0"
              style={{ minHeight: "100vh" }}
            />
          ) : null}
        </div>
      </div>
    </main>
  );
}
