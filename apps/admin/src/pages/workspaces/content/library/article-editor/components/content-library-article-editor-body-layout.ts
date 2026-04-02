export function getContentLibraryArticleEditorTextLaneClass(mode: "split" | "page") {
  return mode === "page"
    ? "mx-auto flex w-full max-w-[72rem] flex-col px-6 md:px-10 xl:px-14"
    : "mx-auto flex w-full max-w-[56rem] flex-col px-5 md:px-8 xl:px-10";
}

export function getContentLibraryArticleEditorBodyEditorClass(mode: "split" | "page") {
  return mode === "page"
    ? "scroll-pb-40 pb-40 pt-4 text-body"
    : "scroll-pb-32 pb-32 pt-0 text-body";
}
