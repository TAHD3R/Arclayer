export function getContentLibraryArticleEditorTextLaneClass(mode: "split" | "page") {
  return mode === "page"
    ? "mx-auto flex w-full max-w-[72rem] flex-col px-6 md:px-10 xl:px-14 [--article-editor-inline-padding:1.5rem] md:[--article-editor-inline-padding:2.5rem] xl:[--article-editor-inline-padding:3.5rem]"
    : "mx-auto flex w-full max-w-[56rem] flex-col px-5 md:px-8 xl:px-10 [--article-editor-inline-padding:1.25rem] md:[--article-editor-inline-padding:2rem] xl:[--article-editor-inline-padding:2.5rem]";
}

export function getContentLibraryArticleEditorBodyEditorClass(mode: "split" | "page") {
  return mode === "page"
    ? "scroll-pb-40 pb-40 pt-4 text-body"
    : "scroll-pb-32 pb-32 pt-0 text-body";
}
