import * as React from "react";

import { useTranslation } from "react-i18next";
import { useEditorRef } from "platejs/react";

import { copyToClipboard } from "@/lib/clipboard";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { Button } from "@arclayer/ui/button";
import { SettingDialog } from "@arclayer/ui/setting-dialog";

import {
  downloadArticleEditorExport,
  serializeArticleEditorToMarkdown,
  type ArticleEditorExportFormat,
} from "../lib/content-library-article-editor-io";

const EXPORT_FORMATS: ArticleEditorExportFormat[] = ["markdown", "docx"];

export function ContentLibraryArticleEditorExportDialog(props: {
  defaultFilename: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation(["content", "common"]);
  const editor = useEditorRef();
  const [format, setFormat] = React.useState<ArticleEditorExportFormat>("markdown");
  const [pending, setPending] = React.useState(false);
  const [preview, setPreview] = React.useState("");

  const textPreview = React.useCallback(async () => {
    if (format === "docx") {
      setPreview("");
      return;
    }
    setPreview(serializeArticleEditorToMarkdown(editor));
  }, [editor, format]);

  React.useEffect(() => {
    if (!props.open) return;
    setPending(false);
    void textPreview();
  }, [props.open, textPreview]);

  React.useEffect(() => {
    if (!props.open) return;
    void textPreview();
  }, [format, props.open, textPreview]);

  const handleCopy = React.useCallback(async () => {
    if (!preview) return;
    try {
      await copyToClipboard(preview);
      notifySuccessText(t("CONTENT_LIBRARY_EDITOR_EXPORT_COPY_SUCCESS"));
    } catch (error) {
      notifyError(error);
    }
  }, [preview, t]);

  const handleDownload = React.useCallback(async () => {
    setPending(true);
    try {
      await downloadArticleEditorExport({
        editor,
        filename: props.defaultFilename,
        format,
      });
      notifySuccessText(t("CONTENT_LIBRARY_EDITOR_EXPORT_SUCCESS"));
    } catch (error) {
      notifyError(error);
    } finally {
      setPending(false);
    }
  }, [editor, format, props.defaultFilename, t]);

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t("CONTENT_LIBRARY_EDITOR_EXPORT_DIALOG_TITLE")}
      description={t("CONTENT_LIBRARY_EDITOR_EXPORT_DIALOG_DESC")}
      contentClassName="sm:max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={() => props.onOpenChange(false)} disabled={pending}>
            {t("common:CANCEL")}
          </Button>
          {format === "markdown" ? (
            <Button
              variant="outline"
              onClick={() => void handleCopy()}
              disabled={!preview || pending}
            >
              {t("CONTENT_LIBRARY_EDITOR_EXPORT_COPY_ACTION")}
            </Button>
          ) : null}
          <Button onClick={() => void handleDownload()} loading={pending}>
            {t("CONTENT_LIBRARY_EDITOR_EXPORT_DOWNLOAD_ACTION")}
          </Button>
        </>
      }
    >
      <div className="grid gap-5 py-2">
        <div className="grid gap-1.5">
          <label className="font-semibold text-label-primary">
            {t("CONTENT_LIBRARY_EDITOR_EXPORT_FORMAT_LABEL")}
          </label>
          <div className="text-label-secondary">
            {t("CONTENT_LIBRARY_EDITOR_EXPORT_FORMAT_HELP")}
          </div>
          <div className="flex flex-wrap gap-2">
            {EXPORT_FORMATS.map((option) => {
              const active = option === format;
              return (
                <Button
                  key={option}
                  type="button"
                  variant={active ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFormat(option)}
                >
                  {t(`CONTENT_LIBRARY_EDITOR_IMPORT_FORMAT_${option.toUpperCase()}`)}
                </Button>
              );
            })}
          </div>
        </div>

        {format === "docx" ? (
          <div className="rounded-xl border border-border/70 bg-muted/20 px-4 py-4 text-footnote text-label-secondary">
            {t("CONTENT_LIBRARY_EDITOR_EXPORT_DOCX_HINT")}
          </div>
        ) : (
          <div className="grid gap-1.5">
            <label
              className="font-semibold text-label-primary"
              htmlFor="article-editor-export-preview"
            >
              {t("CONTENT_LIBRARY_EDITOR_EXPORT_PREVIEW_LABEL")}
            </label>
            <textarea
              id="article-editor-export-preview"
              readOnly
              value={preview}
              className="min-h-64 w-full rounded-lg border border-border/70 bg-card px-3 py-3 text-body outline-none"
            />
          </div>
        )}
      </div>
    </SettingDialog>
  );
}
