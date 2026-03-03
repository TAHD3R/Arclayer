import { createContext, useContext } from "react";

import type { PageBlueprint } from "@celestial/block-protocol";

export type EditorSaveContextValue = {
  saveDraft: (document: PageBlueprint) => Promise<void>;
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
