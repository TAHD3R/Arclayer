import { ChevronDown, FileArchive, Trash2, UploadCloud } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PlatformSkillGitHubImportRequest } from "@arclayer/platform-openapi";

import { SettingDialog } from "@/components/setting-dialog";
import { SettingDialogField, SettingDialogFields } from "@/components/setting-dialog-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const MAX_SKILL_ZIP_BYTES = 2 * 1024 * 1024;
const EMPTY_GITHUB_VALUES: PlatformSkillGitHubImportRequest = {
  repositoryUrl: "",
  requestedRef: "main",
  slug: "",
  displayName: "",
  description: "",
};

export function PlatformSkillGitHubImportDialog({
  open,
  pending,
  onOpenChange,
  onSubmit,
}: Readonly<{
  open: boolean;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: PlatformSkillGitHubImportRequest) => Promise<void>;
}>) {
  const { t } = useTranslation("ai");
  const formId = useId();
  const [values, setValues] = useState(EMPTY_GITHUB_VALUES);
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => {
    if (open) {
      setValues(EMPTY_GITHUB_VALUES);
      setSubmitted(false);
    }
  }, [open]);

  const invalid = submitted && !isGitHubImportComplete(values);
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    if (!isGitHubImportComplete(values)) return;
    void onSubmit({
      repositoryUrl: values.repositoryUrl.trim(),
      requestedRef: values.requestedRef.trim(),
      ...(values.subpath?.trim() ? { subpath: values.subpath.trim() } : {}),
      slug: values.slug.trim(),
      displayName: values.displayName.trim(),
      description: values.description.trim(),
    });
  }

  return (
    <SettingDialog
      contentClassName="sm:max-w-2xl"
      description={t("SKILL_GITHUB_IMPORT_DESCRIPTION")}
      footer={
        <>
          <Button disabled={pending} onClick={() => onOpenChange(false)} variant="outline">
            {t("CANCEL")}
          </Button>
          <Button form={formId} loading={pending} type="submit">
            {t("SKILL_GITHUB_IMPORT_ACTION")}
          </Button>
        </>
      }
      onOpenChange={onOpenChange}
      open={open}
      title={t("SKILL_GITHUB_IMPORT_TITLE")}
    >
      <form id={formId} onSubmit={submit}>
        <SettingDialogFields className="gap-6">
          <SettingDialogField
            error={invalid && !values.repositoryUrl.trim() ? t("SKILL_FIELD_REQUIRED") : undefined}
            title={t("SKILL_GITHUB_REPOSITORY")}
          >
            <Input
              autoComplete="url"
              autoFocus
              inputMode="url"
              onChange={(event) => {
                const identity = deriveRepositoryIdentity(event.target.value);
                setValues((current) => ({
                  ...current,
                  repositoryUrl: event.target.value,
                  slug: current.slug || identity?.slug || "",
                  displayName: current.displayName || identity?.displayName || "",
                }));
              }}
              placeholder={t("SKILL_GITHUB_REPOSITORY_PLACEHOLDER")}
              value={values.repositoryUrl}
            />
          </SettingDialogField>
          <details className="group rounded-lg border">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium">
              {t("SKILL_GITHUB_OPTIONS")}
              <ChevronDown
                aria-hidden="true"
                className="size-4 transition-transform group-open:rotate-180"
              />
            </summary>
            <div className="grid gap-5 border-t p-4 sm:grid-cols-2">
              <SettingDialogField title={t("SKILL_GITHUB_REF")}>
                <Input
                  className="font-mono"
                  onChange={(event) => setValues({ ...values, requestedRef: event.target.value })}
                  placeholder={t("SKILL_GITHUB_REF_PLACEHOLDER")}
                  value={values.requestedRef}
                />
              </SettingDialogField>
              <SettingDialogField title={t("SKILL_GITHUB_SUBPATH")}>
                <Input
                  className="font-mono"
                  onChange={(event) => setValues({ ...values, subpath: event.target.value })}
                  placeholder={t("SKILL_GITHUB_SUBPATH_PLACEHOLDER")}
                  value={values.subpath ?? ""}
                />
              </SettingDialogField>
            </div>
          </details>
          <div className="grid gap-5 sm:grid-cols-2">
            <SettingDialogField
              error={invalid && !values.displayName.trim() ? t("SKILL_FIELD_REQUIRED") : undefined}
              title={t("SKILL_FIELD_NAME")}
            >
              <Input
                onChange={(event) => setValues({ ...values, displayName: event.target.value })}
                placeholder={t("SKILL_FIELD_NAME_PLACEHOLDER")}
                value={values.displayName}
              />
            </SettingDialogField>
            <SettingDialogField
              error={invalid && !values.slug.trim() ? t("SKILL_FIELD_REQUIRED") : undefined}
              title={t("SKILL_FIELD_SLUG")}
            >
              <Input
                className="font-mono"
                onChange={(event) => setValues({ ...values, slug: event.target.value })}
                placeholder={t("SKILL_FIELD_SLUG_PLACEHOLDER")}
                value={values.slug}
              />
            </SettingDialogField>
          </div>
          <SettingDialogField
            error={invalid && !values.description.trim() ? t("SKILL_FIELD_REQUIRED") : undefined}
            title={t("SKILL_FIELD_DESCRIPTION")}
          >
            <Textarea
              className="min-h-24"
              onChange={(event) => setValues({ ...values, description: event.target.value })}
              placeholder={t("SKILL_FIELD_DESCRIPTION_PLACEHOLDER")}
              value={values.description}
            />
          </SettingDialogField>
        </SettingDialogFields>
      </form>
    </SettingDialog>
  );
}

export function PlatformSkillZipImportDialog({
  open,
  pending,
  onOpenChange,
  onSubmit,
}: Readonly<{
  open: boolean;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (file: File) => Promise<void>;
}>) {
  const { t } = useTranslation("ai");
  const inputId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (open) {
      setFile(null);
      setError(null);
      setDragging(false);
    }
  }, [open]);

  function pick(nextFile: File | undefined) {
    if (!nextFile) return;
    if (!nextFile.name.toLowerCase().endsWith(".zip")) {
      setFile(null);
      setError(t("SKILL_ZIP_FORMAT_ERROR"));
      return;
    }
    if (nextFile.size > MAX_SKILL_ZIP_BYTES) {
      setFile(null);
      setError(t("SKILL_ZIP_SIZE_ERROR"));
      return;
    }
    setFile(nextFile);
    setError(null);
  }

  return (
    <SettingDialog
      description={t("SKILL_ZIP_IMPORT_DESCRIPTION")}
      footer={
        <>
          <Button disabled={pending} onClick={() => onOpenChange(false)} variant="outline">
            {t("CANCEL")}
          </Button>
          <Button disabled={!file} loading={pending} onClick={() => file && void onSubmit(file)}>
            {t("SKILL_ZIP_IMPORT_ACTION")}
          </Button>
        </>
      }
      onOpenChange={onOpenChange}
      open={open}
      title={t("SKILL_ZIP_IMPORT_TITLE")}
    >
      <div className="grid gap-4">
        <input
          accept=".zip,application/zip"
          className="sr-only"
          disabled={pending}
          id={inputId}
          onChange={(event) => pick(event.target.files?.[0])}
          type="file"
        />
        <label
          className={cn(
            "grid min-h-48 cursor-pointer place-items-center rounded-xl border border-dashed p-6 text-center transition-colors",
            dragging ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
            pending && "pointer-events-none opacity-60",
          )}
          htmlFor={inputId}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            pick(event.dataTransfer.files[0]);
          }}
        >
          <span className="grid justify-items-center gap-3">
            <span className="grid size-11 place-items-center rounded-full bg-muted">
              <UploadCloud aria-hidden="true" className="size-5 text-muted-foreground" />
            </span>
            <span>
              <span className="block text-sm font-medium">{t("SKILL_ZIP_DROP_TITLE")}</span>
              <span className="mt-1 block text-sm text-muted-foreground">
                {t("SKILL_ZIP_DROP_DESCRIPTION")}
              </span>
            </span>
          </span>
        </label>
        {file ? (
          <div className="flex items-center gap-3 rounded-lg border p-3">
            <FileArchive aria-hidden="true" className="size-5 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{file.name}</div>
              <div className="text-xs text-muted-foreground">{formatBytes(file.size)}</div>
            </div>
            <Button
              aria-label={t("SKILL_ZIP_REMOVE")}
              onClick={() => setFile(null)}
              size="icon"
              variant="ghost"
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </div>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <p className="text-sm text-muted-foreground">{t("SKILL_ZIP_STRUCTURE_HELP")}</p>
      </div>
    </SettingDialog>
  );
}

function isGitHubImportComplete(values: PlatformSkillGitHubImportRequest) {
  return Boolean(
    values.repositoryUrl.trim() &&
    values.requestedRef.trim() &&
    values.slug.trim() &&
    values.displayName.trim() &&
    values.description.trim(),
  );
}

function deriveRepositoryIdentity(value: string) {
  const match = /^https:\/\/github\.com\/[^/]+\/([^/#?]+?)(?:\.git)?\/?$/i.exec(value.trim());
  const repository = match?.[1];
  if (!repository) return null;
  const slug = repository
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  if (!slug) return null;
  return {
    slug,
    displayName: slug
      .split("-")
      .filter(Boolean)
      .map((part) => part[0]?.toUpperCase() + part.slice(1))
      .join(" "),
  };
}

function formatBytes(bytes: number) {
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
