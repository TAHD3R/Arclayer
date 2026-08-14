import { FileArchive, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";

import type { SkillGitHubImportCreateRequest } from "@arclayer/openapi";
import { Button } from "@arclayer/ui/button";
import {
  ChromeTabs,
  ChromeTabsContent,
  ChromeTabsList,
  ChromeTabsTrigger,
} from "@arclayer/ui/chrome-tabs";
import { Input } from "@arclayer/ui/input";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { SettingDialogField } from "@arclayer/ui/setting-dialog-field";

import { zodResolver } from "@/lib/forms/zod-resolver";
import { FileUpload } from "@/pages/workspaces/assets/components/file-upload/file-upload";
import {
  githubSkillImportDefaults,
  githubSkillImportSchema,
  toGitHubSkillImportPayload,
  type GitHubSkillImportValues,
} from "./workspace-skill-github-model";

const MAX_SKILL_ZIP_BYTES = 2 * 1024 * 1024;
const GITHUB_FORM_ID = "workspace-skill-github-import-form";

export type WorkspaceSkillImportMode = "github" | "zip";

export function WorkspaceSkillImportDialog(props: {
  initialMode: WorkspaceSkillImportMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  githubPending: boolean;
  zipPending: boolean;
  onGitHubSubmit: (payload: SkillGitHubImportCreateRequest) => Promise<void>;
  onZipSubmit: (file: File) => Promise<void>;
}) {
  const { t } = useTranslation(["settings", "common"]);
  const [mode, setMode] = useState<WorkspaceSkillImportMode>(props.initialMode);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const form = useForm<GitHubSkillImportValues>({
    resolver: zodResolver(githubSkillImportSchema),
    defaultValues: githubSkillImportDefaults,
  });

  useEffect(() => {
    if (!props.open) return;
    setMode(props.initialMode);
    setFile(null);
    setFileError(null);
    form.reset(githubSkillImportDefaults);
  }, [form, props.initialMode, props.open]);

  const githubSubmit = form.handleSubmit(async (values) => {
    await props.onGitHubSubmit(toGitHubSkillImportPayload(values));
    props.onOpenChange(false);
  });

  function selectFile(next: File | null) {
    if (!next) return;
    if (!next.name.toLowerCase().endsWith(".zip")) {
      setFile(null);
      setFileError(t("settings:SETTINGS_WORKSPACE_SKILLS_ZIP_FORMAT_ERROR"));
      return;
    }
    if (next.size > MAX_SKILL_ZIP_BYTES) {
      setFile(null);
      setFileError(t("settings:SETTINGS_WORKSPACE_SKILLS_ZIP_SIZE_ERROR"));
      return;
    }
    setFile(next);
    setFileError(null);
  }

  const pending = props.githubPending || props.zipPending;
  const primaryAction =
    mode === "github" ? (
      <Button type="submit" form={GITHUB_FORM_ID} loading={props.githubPending} disabled={pending}>
        {t("settings:SETTINGS_WORKSPACE_SKILLS_GITHUB_IMPORT_ACTION")}
      </Button>
    ) : (
      <Button
        disabled={!file || pending}
        loading={props.zipPending}
        onClick={() => {
          if (!file) return;
          void props.onZipSubmit(file).then(() => props.onOpenChange(false));
        }}
      >
        {t("settings:SETTINGS_WORKSPACE_SKILLS_ZIP_IMPORT_ACTION")}
      </Button>
    );

  return (
    <ChromeTabs value={mode} onValueChange={(value) => setMode(value as WorkspaceSkillImportMode)}>
      <SettingDialog
        bodyClassName="!p-0"
        contentClassName="h-[min(44rem,calc(100dvh-2rem))] sm:max-w-2xl"
        description={t("settings:SETTINGS_WORKSPACE_SKILLS_IMPORT_DIALOG_DESC")}
        footer={
          <>
            <Button disabled={pending} onClick={() => props.onOpenChange(false)} variant="ghost">
              {t("common:CANCEL")}
            </Button>
            {primaryAction}
          </>
        }
        headerContent={
          <div className="px-6">
            <ChromeTabsList
              className="w-full"
              aria-label={t("settings:SETTINGS_WORKSPACE_SKILLS_IMPORT_MODE_LABEL")}
            >
              <ChromeTabsTrigger className="flex-1 justify-center px-4 first:pl-4" value="github">
                {t("settings:SETTINGS_WORKSPACE_SKILLS_IMPORT_GITHUB")}
              </ChromeTabsTrigger>
              <ChromeTabsTrigger className="flex-1 justify-center px-4" value="zip">
                {t("settings:SETTINGS_WORKSPACE_SKILLS_UPLOAD_ZIP")}
              </ChromeTabsTrigger>
            </ChromeTabsList>
          </div>
        }
        onOpenChange={props.onOpenChange}
        open={props.open}
        preventInitialFocus={false}
        title={t("settings:SETTINGS_WORKSPACE_SKILLS_IMPORT_DIALOG_TITLE")}
      >
        <ChromeTabsContent className="px-6 py-5" value="github">
          <form id={GITHUB_FORM_ID} onSubmit={githubSubmit}>
            <SettingDialogField
              description={t("settings:SETTINGS_WORKSPACE_SKILLS_GITHUB_REPOSITORY_HELP")}
              error={
                form.formState.errors.repositoryUrl
                  ? t("settings:SETTINGS_WORKSPACE_SKILLS_GITHUB_REPOSITORY_ERROR")
                  : undefined
              }
              title={
                <label htmlFor={`${GITHUB_FORM_ID}-repository`}>
                  {t("settings:SETTINGS_WORKSPACE_SKILLS_GITHUB_REPOSITORY_LABEL")}
                </label>
              }
            >
              <Input
                {...form.register("repositoryUrl")}
                aria-invalid={Boolean(form.formState.errors.repositoryUrl)}
                autoComplete="url"
                autoFocus
                id={`${GITHUB_FORM_ID}-repository`}
                inputMode="url"
                placeholder={t("settings:SETTINGS_WORKSPACE_SKILLS_GITHUB_REPOSITORY_PLACEHOLDER")}
              />
            </SettingDialogField>
          </form>
        </ChromeTabsContent>

        <ChromeTabsContent className="space-y-4 px-6 py-5" value="zip">
          <FileUpload.DropZone
            accept=".zip,application/zip"
            allowsMultiple={false}
            description={t("settings:SETTINGS_WORKSPACE_SKILLS_ZIP_DROP_DESC")}
            formatsHelpLabel={t("settings:SETTINGS_WORKSPACE_SKILLS_ZIP_FORMATS_HELP")}
            hintDetail={t("settings:SETTINGS_WORKSPACE_SKILLS_ZIP_REQUIREMENTS")}
            hintSummary={t("settings:SETTINGS_WORKSPACE_SKILLS_ZIP_PICK_FILE_DESC")}
            isDisabled={pending}
            maxSizeBytes={MAX_SKILL_ZIP_BYTES}
            onDropUnacceptedFiles={() => {
              setFile(null);
              setFileError(t("settings:SETTINGS_WORKSPACE_SKILLS_ZIP_FORMAT_ERROR"));
            }}
            onPickFiles={(files) => selectFile(files[0] ?? null)}
            onSizeLimitExceed={() => {
              setFile(null);
              setFileError(t("settings:SETTINGS_WORKSPACE_SKILLS_ZIP_SIZE_ERROR"));
            }}
            title={t("settings:SETTINGS_WORKSPACE_SKILLS_ZIP_PICK_FILE")}
          />
          {file ? (
            <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
              <FileArchive aria-hidden="true" className="size-8 shrink-0 text-label-secondary" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-footnote font-semibold text-label-primary">
                  {file.name}
                </div>
                <div className="text-caption text-label-secondary">{formatBytes(file.size)}</div>
              </div>
              <Button
                aria-label={t("common:REMOVE")}
                disabled={pending}
                onClick={() => setFile(null)}
                size="icon-sm"
                variant="ghost"
              >
                <X aria-hidden="true" />
              </Button>
            </div>
          ) : null}
          {fileError ? <p className="text-footnote text-destructive">{fileError}</p> : null}
        </ChromeTabsContent>
      </SettingDialog>
    </ChromeTabs>
  );
}

function formatBytes(value: number) {
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
  return `${Math.ceil(value / 1024)} KiB`;
}
