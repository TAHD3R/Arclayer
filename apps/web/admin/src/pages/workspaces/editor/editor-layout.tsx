import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { Button } from "antd";

import { Canvas } from "@/pages/workspaces/editor/components/canvas";
import { CanvasToolbar } from "@/pages/workspaces/editor/components/canvas-toolbar";
import { ActivityBar } from "@/pages/workspaces/editor/components/activity-bar";
import { SidebarPanel } from "@/pages/workspaces/editor/components/sidebar-panel";
import { EditorHeader } from "@/pages/workspaces/editor/components/editor-header";
import { PropertiesPanel } from "@/pages/workspaces/editor/panels/properties-panel";
import { useEditorStore } from "@/pages/workspaces/editor/stores/editor-store";

type EditorLayoutProps = {
  iframeSrc: string;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  isLoading: boolean;
  loadError: string | null;
};

function PreviewHeader() {
  const { t } = useTranslation(["content_pages"]);
  const togglePreviewMode = useEditorStore((s) => s.togglePreviewMode);

  return (
    <header className="flex h-12 shrink-0 items-center border-b bg-card px-3">
      <Button type="text" icon={<ArrowLeft className="size-4" />} onClick={togglePreviewMode}>
        {t("content_pages:EDITOR_V2_PREVIEW_EXIT")}
      </Button>
    </header>
  );
}

export function EditorLayout({ iframeSrc, iframeRef, isLoading, loadError }: EditorLayoutProps) {
  const isPreviewMode = useEditorStore((s) => s.isPreviewMode);

  if (isPreviewMode) {
    return (
      <div className="flex h-screen flex-col bg-background">
        <PreviewHeader />
        <Canvas
          iframeSrc={iframeSrc}
          iframeRef={iframeRef}
          isLoading={isLoading}
          loadError={loadError}
        />
      </div>
    );
  }

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
