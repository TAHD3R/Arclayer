import { createContext, useContext } from "react";

import type { WorkspaceEditorMode } from "@/pages/workspaces/editor/page";

export type EditorConfig = {
  workspaceId: string;
  entityId: string;
  editorMode: WorkspaceEditorMode;
  initialPathname: string;
};

const EditorConfigContext = createContext<EditorConfig | null>(null);

export const EditorConfigProvider = EditorConfigContext.Provider;

export function useEditorConfig(): EditorConfig {
  const ctx = useContext(EditorConfigContext);
  if (!ctx) {
    throw new Error("useEditorConfig must be used within EditorConfigProvider");
  }
  return ctx;
}
