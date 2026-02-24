import { createContext, useContext } from "react";

import type { PortalApi } from "@/pages/workspaces/editor/hooks/use-editor-bridge";

export type EditorBridgeContextValue = {
  portal: PortalApi | null;
};

const EditorBridgeContext = createContext<EditorBridgeContextValue | null>(null);

export const EditorBridgeProvider = EditorBridgeContext.Provider;

export function useEditorBridgeContext(): EditorBridgeContextValue {
  const ctx = useContext(EditorBridgeContext);
  if (!ctx) {
    throw new Error("useEditorBridgeContext must be used within EditorBridgeProvider");
  }
  return ctx;
}
