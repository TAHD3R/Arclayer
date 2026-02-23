import { EditorLayout } from "@/pages/workspaces/editor/editor-layout";

export type WorkspaceEditorMode = "page" | "article";

export type WorkspaceEditorViewProps = {
  workspaceId: string;
  editorMode: WorkspaceEditorMode;
  entityId: string;
  initialPathname?: string;
};

export function WorkspaceEditorView(_props: WorkspaceEditorViewProps) {
  return <EditorLayout />;
}
