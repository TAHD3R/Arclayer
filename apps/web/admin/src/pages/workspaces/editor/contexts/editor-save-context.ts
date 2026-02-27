import { createContext, useContext } from "react";

import type { DesignDocumentV1 } from "@celestial/site-block-protocol";

export type EditorSaveContextValue = {
  saveDraft: (document: DesignDocumentV1) => Promise<void>;
  publish: () => Promise<void>;
  draftRevisionRef: React.RefObject<number | null>;
};

const EditorSaveContext = createContext<EditorSaveContextValue | null>(null);

export const EditorSaveProvider = EditorSaveContext.Provider;

export function useEditorSaveContext(): EditorSaveContextValue {
  const ctx = useContext(EditorSaveContext);
  if (!ctx) {
    throw new Error("useEditorSaveContext must be used within EditorSaveProvider");
  }
  return ctx;
}
