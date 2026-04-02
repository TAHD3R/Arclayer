"use client";

import { Editor, EditorContainer, PlateFloatingToolbar } from "@arclayer/ui/editor";
import { cn } from "@arclayer/lib/utils";

export function getContentLibraryArticleEditorTextLaneClass(mode: "split" | "page") {
  return mode === "page"
    ? "mx-auto flex w-full max-w-[72rem] flex-col px-6  md:px-10 xl:px-14"
    : "mx-auto flex w-full max-w-[56rem] flex-col px-5  md:px-8 xl:px-10";
}

export function getContentLibraryArticleEditorBodyEditorClass(mode: "split" | "page") {
  return mode === "page"
    ? "-ml-[3.75rem] scroll-pb-40 pb-40 pl-[4.25rem] pt-4 text-body"
    : "-ml-[3.25rem] scroll-pb-32 pb-32 pl-[3.75rem] pt-0 text-body";
}

export function ContentLibraryArticleEditorBody(props: {
  placeholder: string;
  mode: "split" | "page";
  className?: string;
}) {
  const contentLaneClass = cn(
    getContentLibraryArticleEditorTextLaneClass(props.mode),
    "min-h-0 flex-1",
  );

  return (
    <div
      data-testid="content-library-article-editor-body"
      className={cn("flex min-h-0 w-full flex-1 flex-col", props.className)}
    >
      <EditorContainer className="flex min-h-0 flex-1 flex-col overflow-visible bg-transparent">
        <PlateFloatingToolbar />

        <div className={contentLaneClass}>
          <Editor
            aria-label="Article body"
            className={cn(
              "min-h-full flex-1 overflow-visible text-label-primary placeholder:text-label-tertiary **:data-slate-placeholder:!top-1 **:data-slate-placeholder:!left-0 **:data-slate-placeholder:!translate-y-0 [&_.slate-blockWrapper]:overflow-visible",
              getContentLibraryArticleEditorBodyEditorClass(props.mode),
            )}
            placeholder={props.placeholder}
            variant="none"
          />
        </div>
      </EditorContainer>
    </div>
  );
}
