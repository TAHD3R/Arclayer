"use client";

import { PlateFloatingToolbar } from "@/components/editor/plugins/floating-toolbar-kit";
import { Editor, EditorContainer } from "@/components/ui/editor";
import { cn } from "@arclayer/lib/utils";

export function ContentLibraryArticleEditorBody(props: {
  placeholder: string;
  mode: "split" | "page";
  className?: string;
}) {
  const contentLaneClass =
    props.mode === "page"
      ? "mx-auto flex min-h-0 w-full max-w-[76rem] flex-1 flex-col px-6 pl-16"
      : "flex min-h-0 w-full flex-1 flex-col px-4 pl-16";

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
              "min-h-full flex-1 overflow-visible text-foreground placeholder:text-label-tertiary **:data-slate-placeholder:!top-1 **:data-slate-placeholder:!left-0 **:data-slate-placeholder:!translate-y-0 [&_.slate-blockWrapper]:overflow-visible",
              props.mode === "page"
                ? "pb-28 pt-4 text-[1.06rem] leading-8"
                : "pb-10 pt-0 text-base leading-7",
            )}
            placeholder={props.placeholder}
            variant="none"
          />
        </div>
      </EditorContainer>
    </div>
  );
}
