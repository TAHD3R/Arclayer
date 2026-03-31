"use client";

import * as React from "react";

type ArticleEditorCommandContextValue = {
  insertItem: (editor: unknown, value: string) => void;
  openMediaInsert?: (
    editor: unknown,
    params: { kind: "image" | "video" | "audio" | "file"; source: "upload" | "url" },
  ) => void;
};

const ArticleEditorCommandContext = React.createContext<ArticleEditorCommandContextValue | null>(
  null,
);

export function ArticleEditorCommandProvider(props: {
  value: ArticleEditorCommandContextValue;
  children: React.ReactNode;
}) {
  return (
    <ArticleEditorCommandContext.Provider value={props.value}>
      {props.children}
    </ArticleEditorCommandContext.Provider>
  );
}

export function useArticleEditorCommands() {
  return React.useContext(ArticleEditorCommandContext);
}
