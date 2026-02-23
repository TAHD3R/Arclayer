import { Canvas } from "@/pages/workspaces/editor/components/canvas";
import { StatusBar } from "@/pages/workspaces/editor/components/status-bar";
import { Toolbar } from "@/pages/workspaces/editor/components/toolbar";
import { LeftPanel } from "@/pages/workspaces/editor/panels/left-panel";
import { Inspector } from "@/pages/workspaces/editor/panels/inspector";
import { useEditorStore } from "@/pages/workspaces/editor/stores/editor-store";

export function EditorLayout() {
  const leftPanelOpen = useEditorStore((s) => s.leftPanelOpen);
  const rightPanelOpen = useEditorStore((s) => s.rightPanelOpen);

  return (
    <div className="flex h-screen flex-col bg-background">
      <Toolbar onUndo={() => {}} onRedo={() => {}} />
      <div className="flex min-h-0 flex-1">
        {leftPanelOpen ? <LeftPanel /> : null}
        <Canvas />
        {rightPanelOpen ? <Inspector /> : null}
      </div>
      <StatusBar />
    </div>
  );
}
