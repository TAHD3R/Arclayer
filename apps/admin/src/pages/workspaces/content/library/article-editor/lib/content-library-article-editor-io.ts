import type { Value } from "platejs";

export type ArticleEditorImportFormat = "markdown" | "html" | "csv" | "docx";
export type ArticleEditorExportFormat = "markdown" | "docx";

type ArticleEditorIoEditor = {
  api?: Record<string, unknown>;
  children?: Value;
};

const EMPTY_VALUE: Value = [{ type: "p", children: [{ text: "" }] }];

function normalizeImportedValue(value: unknown): Value {
  if (!Array.isArray(value) || value.length === 0) {
    return EMPTY_VALUE;
  }
  return value as Value;
}

function requireMarkdownApi(editor: ArticleEditorIoEditor) {
  const api = (
    editor.api as
      | { markdown?: { deserialize: (source: string) => Value; serialize: () => string } }
      | undefined
  )?.markdown;
  if (!api) throw new Error("ARTICLE_EDITOR_MARKDOWN_API_UNAVAILABLE");
  return api;
}

function requireHtmlApi(editor: ArticleEditorIoEditor) {
  const api = (
    editor.api as
      | {
          html?: {
            deserialize: (options: { element: HTMLElement | string }) => Value | Promise<Value>;
          };
        }
      | undefined
  )?.html;
  if (!api) throw new Error("ARTICLE_EDITOR_HTML_API_UNAVAILABLE");
  return api;
}

function requireCsvApi(editor: ArticleEditorIoEditor) {
  const api = (
    editor.api as
      | {
          csv?: {
            deserialize: (options: { data: string }) => Value;
          };
        }
      | undefined
  )?.csv;
  if (!api) throw new Error("ARTICLE_EDITOR_CSV_API_UNAVAILABLE");
  return api;
}

function toStoredDocument(value: Value): Record<string, unknown> {
  return {
    type: "doc",
    content: normalizeImportedValue(value),
  };
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function importArticleEditorDocument(params: {
  editor: ArticleEditorIoEditor;
  file?: File | null;
  format: ArticleEditorImportFormat;
  text?: string;
}): Promise<Record<string, unknown>> {
  const text = params.text?.trim() ?? "";

  if (params.format === "markdown") {
    if (!text) throw new Error("ARTICLE_EDITOR_IMPORT_TEXT_REQUIRED");
    return toStoredDocument(requireMarkdownApi(params.editor).deserialize(text));
  }

  if (params.format === "html") {
    if (!text) throw new Error("ARTICLE_EDITOR_IMPORT_TEXT_REQUIRED");
    const value = await requireHtmlApi(params.editor).deserialize({ element: text });
    return toStoredDocument(normalizeImportedValue(value));
  }

  if (params.format === "csv") {
    if (!text) throw new Error("ARTICLE_EDITOR_IMPORT_TEXT_REQUIRED");
    return toStoredDocument(requireCsvApi(params.editor).deserialize({ data: text }));
  }

  const file = params.file;
  if (!file) throw new Error("ARTICLE_EDITOR_IMPORT_FILE_REQUIRED");
  const { importDocx } = await import("@platejs/docx-io");
  const arrayBuffer = await file.arrayBuffer();
  const result = await importDocx(params.editor as never, arrayBuffer);
  return toStoredDocument(normalizeImportedValue(result.nodes));
}

export function serializeArticleEditorToMarkdown(editor: ArticleEditorIoEditor): string {
  return requireMarkdownApi(editor).serialize();
}

export async function downloadArticleEditorExport(params: {
  editor: ArticleEditorIoEditor;
  filename: string;
  format: ArticleEditorExportFormat;
}): Promise<string | null> {
  if (params.format === "markdown") {
    const markdown = serializeArticleEditorToMarkdown(params.editor);
    downloadBlob(
      params.filename.endsWith(".md") ? params.filename : `${params.filename}.md`,
      new Blob([markdown], { type: "text/markdown;charset=utf-8" }),
    );
    return markdown;
  }

  const nodes = normalizeImportedValue(params.editor.children);
  const { downloadDocx, exportToDocx } = await import("@platejs/docx-io");
  const blob = await exportToDocx(nodes, {
    fontFamily: "Calibri",
    margins: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
    orientation: "portrait",
  });
  downloadDocx(
    blob,
    params.filename.endsWith(".docx") ? params.filename : `${params.filename}.docx`,
  );
  return null;
}
