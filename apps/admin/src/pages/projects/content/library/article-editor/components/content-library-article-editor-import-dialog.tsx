import * as React from "react";

import { useTranslation } from "react-i18next";
import { useEditorRef } from "platejs/react";

import { notifyError, notifySuccessText } from "@/lib/notifications";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { SettingDialogField, SettingDialogFields } from "@arclayer/ui/setting-dialog-field";
import { SettingDialog } from "@arclayer/ui/setting-dialog";

import {
  importArticleEditorDocument,
  type ArticleEditorImportFormat,
} from "../lib/content-library-article-editor-io";

const IMPORT_FORMATS: ArticleEditorImportFormat[] = ["markdown", "html", "csv", "docx"];

export function ContentLibraryArticleEditorImportDialog(props: {
  open: boolean;
  onImportDocument: (value: Record<string, unknown>) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation(["content", "common"]);
  const editor = useEditorRef();
  const [format, setFormat] = React.useState<ArticleEditorImportFormat>("markdown");
  const [pending, setPending] = React.useState(false);
  const [textValue, setTextValue] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);

  React.useEffect(() => {
    if (!props.open) return;
    setPending(false);
    setTextValue("");
    setFile(null);
    setFormat("markdown");
  }, [props.open]);

  const requiresFile = format === "docx";

  const handleImport = React.useCallback(async () => {
    setPending(true);
    try {
      const nextDocument = await importArticleEditorDocument({
        editor,
        file,
        format,
        text: textValue,
      });
      props.onImportDocument(nextDocument);
      props.onOpenChange(false);
      notifySuccessText(t("CONTENT_LIBRARY_EDITOR_IMPORT_SUCCESS"));
    } catch (error) {
      notifyError(error);
    } finally {
      setPending(false);
    }
  }, [editor, file, format, props, t, textValue]);

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t("CONTENT_LIBRARY_EDITOR_IMPORT_DIALOG_TITLE")}
      description={t("CONTENT_LIBRARY_EDITOR_IMPORT_DIALOG_DESC")}
      footer={
        <>
          <Button variant="ghost" onClick={() => props.onOpenChange(false)} disabled={pending}>
            {t("common:CANCEL")}
          </Button>
          <Button
            onClick={() => {
              void handleImport();
            }}
            loading={pending}
            disabled={requiresFile ? !file : !textValue.trim()}
          >
            {t("CONTENT_LIBRARY_EDITOR_IMPORT_ACTION")}
          </Button>
        </>
      }
    >
      <SettingDialogFields className="py-2">
        <SettingDialogField
          title={t("CONTENT_LIBRARY_EDITOR_IMPORT_FORMAT_LABEL")}
          description={t("CONTENT_LIBRARY_EDITOR_IMPORT_FORMAT_HELP")}
        >
          <div className="flex flex-wrap gap-2">
            {IMPORT_FORMATS.map((option) => {
              const active = option === format;
              return (
                <Button
                  key={option}
                  type="button"
                  variant={active ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setFormat(option);
                    setTextValue("");
                    setFile(null);
                  }}
                >
                  {t(`CONTENT_LIBRARY_EDITOR_IMPORT_FORMAT_${option.toUpperCase()}`)}
                </Button>
              );
            })}
          </div>
        </SettingDialogField>

        {requiresFile ? (
          <SettingDialogField
            title={t("CONTENT_LIBRARY_EDITOR_IMPORT_FILE_LABEL")}
            description={t("CONTENT_LIBRARY_EDITOR_IMPORT_FILE_HELP")}
          >
            <Input
              id="article-editor-import-file"
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </SettingDialogField>
        ) : (
          <SettingDialogField
            title={t("CONTENT_LIBRARY_EDITOR_IMPORT_TEXT_LABEL")}
            description={t("CONTENT_LIBRARY_EDITOR_IMPORT_TEXT_HELP")}
          >
            <textarea
              id="article-editor-import-text"
              value={textValue}
              onChange={(event) => setTextValue(event.target.value)}
              className="min-h-64 w-full rounded-lg border border-border/70 bg-card px-3 py-3 text-body outline-none focus-visible:border-ring"
              placeholder={t("CONTENT_LIBRARY_EDITOR_IMPORT_TEXT_PLACEHOLDER")}
            />
          </SettingDialogField>
        )}
      </SettingDialogFields>
    </SettingDialog>
  );
}
