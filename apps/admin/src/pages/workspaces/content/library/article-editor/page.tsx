import * as React from "react";

import { DefaultPage } from "@/layouts/page-shell/default-page";

import { ContentLibraryArticleEditorShell } from "./content-library-article-editor-shell";

export function ContentLibraryArticleEditorPage(props: { workspaceId: string; itemId: string }) {
  const [title, setTitle] = React.useState("");
  const [summary, setSummary] = React.useState("");

  return (
    <DefaultPage className="h-full" contentClassName="min-h-0 flex flex-col">
      <div
        className="flex min-h-0 flex-1 flex-col"
        data-item-id={props.itemId}
        data-workspace-id={props.workspaceId}
      >
        <ContentLibraryArticleEditorShell
          mode="page"
          title={title}
          summary={summary}
          onTitleChange={setTitle}
          onSummaryChange={setSummary}
          className="min-h-0 flex-1"
        />
      </div>
    </DefaultPage>
  );
}
