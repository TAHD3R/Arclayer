"use client";

import { Editor, EditorContainer, PlateFloatingToolbar } from "@arclayer/ui/editor";
import { cn } from "@arclayer/lib/utils";
import {
  getContentLibraryArticleEditorBodyEditorClass,
  getContentLibraryArticleEditorTextLaneClass,
} from "./content-library-article-editor-body-layout";

export {
  getContentLibraryArticleEditorBodyEditorClass,
  getContentLibraryArticleEditorTextLaneClass,
} from "./content-library-article-editor-body-layout";

export function ContentLibraryArticleEditorBody(props: {
  placeholder: string;
  mode: "split" | "page";
  className?: string;
}) {
  return (
    <div
      data-testid="content-library-article-editor-body"
      data-plate-selectable="true"
      data-article-editor-selection-surface="true"
      className={cn("flex w-full flex-col", props.className)}
    >
      <EditorContainer
        data-plate-selectable="true"
        data-article-editor-selection-surface="true"
        className={cn(
          "h-auto flex-none flex-col overflow-visible bg-transparent",
          getContentLibraryArticleEditorTextLaneClass(props.mode),
        )}
      >
        <PlateFloatingToolbar />
        <Editor
          aria-label="Content body"
          className={cn(
            "w-full overflow-visible text-label-primary placeholder:text-label-tertiary **:data-slate-placeholder:!top-1 **:data-slate-placeholder:!left-0 **:data-slate-placeholder:!translate-y-0 [&_.slate-blockWrapper]:overflow-visible",
            getContentLibraryArticleEditorBodyEditorClass(props.mode),
          )}
          data-plate-selectable="true"
          data-article-editor-selection-surface="true"
          variant="none"
        />
      </EditorContainer>
    </div>
  );
}
