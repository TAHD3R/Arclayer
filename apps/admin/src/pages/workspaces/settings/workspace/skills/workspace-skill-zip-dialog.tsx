import { FileArchive, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { FileUpload } from "@/pages/workspaces/assets/components/file-upload/file-upload";

const MAX_SKILL_ZIP_BYTES = 2 * 1024 * 1024;

export function WorkspaceSkillZipImportDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  onSubmit: (file: File) => Promise<void>;
}) {
  const { t } = useTranslation(["settings", "common"]);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (props.open) {
      setFile(null);
      setError(null);
    }
  }, [props.open]);

  function selectFile(next: File | null) {
    if (!next) return;
    if (!next.name.toLowerCase().endsWith(".zip")) {
      setFile(null);
      setError(t("settings:SETTINGS_WORKSPACE_SKILLS_ZIP_FORMAT_ERROR"));
      return;
    }
    if (next.size > MAX_SKILL_ZIP_BYTES) {
      setFile(null);
      setError(t("settings:SETTINGS_WORKSPACE_SKILLS_ZIP_SIZE_ERROR"));
      return;
    }
    setFile(next);
    setError(null);
  }

  async function submit() {
    if (!file) return;
    await props.onSubmit(file);
    props.onOpenChange(false);
  }

  return (
    <SettingDialog
      contentClassName="sm:max-w-2xl"
      description={t("settings:SETTINGS_WORKSPACE_SKILLS_ZIP_IMPORT_DESC")}
      footer={
        <>
          <Button
            disabled={props.pending}
            onClick={() => props.onOpenChange(false)}
            variant="ghost"
          >
            {t("common:CANCEL")}
          </Button>
          <Button
            disabled={!file || props.pending}
            loading={props.pending}
            onClick={() => void submit()}
          >
            {t("settings:SETTINGS_WORKSPACE_SKILLS_ZIP_IMPORT_ACTION")}
          </Button>
        </>
      }
      onOpenChange={props.onOpenChange}
      open={props.open}
      title={t("settings:SETTINGS_WORKSPACE_SKILLS_ZIP_IMPORT_TITLE")}
    >
      <div className="space-y-4">
        <FileUpload.DropZone
          accept=".zip,application/zip"
          allowsMultiple={false}
          description={t("settings:SETTINGS_WORKSPACE_SKILLS_ZIP_DROP_DESC")}
          formatsHelpLabel={t("settings:SETTINGS_WORKSPACE_SKILLS_ZIP_FORMATS_HELP")}
          hintDetail={t("settings:SETTINGS_WORKSPACE_SKILLS_ZIP_REQUIREMENTS")}
          hintSummary={t("settings:SETTINGS_WORKSPACE_SKILLS_ZIP_PICK_FILE_DESC")}
          isDisabled={props.pending}
          maxSizeBytes={MAX_SKILL_ZIP_BYTES}
          onDropUnacceptedFiles={() => {
            setFile(null);
            setError(t("settings:SETTINGS_WORKSPACE_SKILLS_ZIP_FORMAT_ERROR"));
          }}
          onPickFiles={(files) => selectFile(files[0] ?? null)}
          onSizeLimitExceed={() => {
            setFile(null);
            setError(t("settings:SETTINGS_WORKSPACE_SKILLS_ZIP_SIZE_ERROR"));
          }}
          title={t("settings:SETTINGS_WORKSPACE_SKILLS_ZIP_PICK_FILE")}
        />
        {file ? (
          <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
            <FileArchive className="size-8 shrink-0 text-label-secondary" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-footnote font-semibold text-label-primary">
                {file.name}
              </div>
              <div className="text-caption text-label-secondary">{formatBytes(file.size)}</div>
            </div>
            <Button
              aria-label={t("common:REMOVE")}
              disabled={props.pending}
              onClick={() => setFile(null)}
              size="icon-sm"
              variant="ghost"
            >
              <X aria-hidden="true" />
            </Button>
          </div>
        ) : null}
        {error ? <p className="text-footnote text-destructive">{error}</p> : null}
        <p className="text-footnote leading-5 text-label-secondary">
          {t("settings:SETTINGS_WORKSPACE_SKILLS_ZIP_REQUIREMENTS")}
        </p>
      </div>
    </SettingDialog>
  );
}

function formatBytes(value: number) {
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
  return `${Math.ceil(value / 1024)} KiB`;
}
