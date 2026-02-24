import { Canvas } from "@/pages/workspaces/editor/components/canvas";
import { CanvasToolbar } from "@/pages/workspaces/editor/components/canvas-toolbar";
import { ActivityBar } from "@/pages/workspaces/editor/components/activity-bar";
import { SidebarPanel } from "@/pages/workspaces/editor/components/sidebar-panel";
import { EditorHeader } from "@/pages/workspaces/editor/components/editor-header";

import { PropertiesPanel } from "@/pages/workspaces/editor/panels/properties-panel";

type EditorLayoutProps = {
  iframeSrc: string;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  isLoading: boolean;
  loadError: string | null;
  portalOrigin: string;
};

export function EditorLayout({ iframeSrc, iframeRef, isLoading, loadError }: EditorLayoutProps) {
  return (
    <div className="flex h-screen flex-col bg-background">
      <EditorHeader />
      <div className="flex min-h-0 flex-1">
        <ActivityBar />
        <SidebarPanel />
        <div className="flex min-w-0 flex-1 flex-col">
          <CanvasToolbar />
          <Canvas
            iframeSrc={iframeSrc}
            iframeRef={iframeRef}
            isLoading={isLoading}
            loadError={loadError}
          />
        </div>
        <PropertiesPanel />
      </div>
    </div>
  );
}
