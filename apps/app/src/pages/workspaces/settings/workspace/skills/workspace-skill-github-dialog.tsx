import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { SkillGitHubImportCreateRequest } from "@arclayer/openapi";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { SettingDialogField, SettingDialogFields } from "@arclayer/ui/setting-dialog-field";
import { Textarea } from "@arclayer/ui/textarea";

import { zodResolver } from "@/lib/forms/zod-resolver";
import {
  deriveGitHubSkillIdentity,
  githubSkillImportDefaults,
  githubSkillImportSchema,
  toGitHubSkillImportPayload,
  type GitHubSkillImportValues,
} from "./workspace-skill-github-model";

export function WorkspaceSkillGitHubImportDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  onSubmit: (payload: SkillGitHubImportCreateRequest) => Promise<void>;
}) {
  const { t } = useTranslation(["settings", "common"]);
  const formId = "workspace-skill-github-import-form";
  const form = useForm<GitHubSkillImportValues>({
    resolver: zodResolver(githubSkillImportSchema),
    defaultValues: githubSkillImportDefaults,
  });
  const repositoryField = form.register("repositoryUrl");

  useEffect(() => {
    if (props.open) form.reset(githubSkillImportDefaults);
  }, [form, props.open]);

  const submit = form.handleSubmit(async (values) => {
    await props.onSubmit(toGitHubSkillImportPayload(values));
    props.onOpenChange(false);
  });

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t("settings:SETTINGS_WORKSPACE_SKILLS_GITHUB_IMPORT_TITLE")}
      description={t("settings:SETTINGS_WORKSPACE_SKILLS_GITHUB_IMPORT_DESC")}
      contentClassName="sm:max-w-2xl"
      preventInitialFocus={false}
      footer={
        <>
          <Button
            variant="ghost"
            disabled={props.pending}
            onClick={() => props.onOpenChange(false)}
          >
            {t("common:CANCEL")}
          </Button>
          <Button type="submit" form={formId} loading={props.pending} disabled={props.pending}>
            {t("settings:SETTINGS_WORKSPACE_SKILLS_IMPORT_GITHUB")}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit}>
        <SettingDialogFields className="gap-6">
          <SettingDialogField
            title={
              <label htmlFor={`${formId}-repository`}>
                {t("settings:SETTINGS_WORKSPACE_SKILLS_GITHUB_REPOSITORY_LABEL")}
              </label>
            }
            error={
              form.formState.errors.repositoryUrl
                ? t("settings:SETTINGS_WORKSPACE_SKILLS_GITHUB_REPOSITORY_ERROR")
                : undefined
            }
          >
            <Input
              id={`${formId}-repository`}
              autoFocus
              autoComplete="url"
              inputMode="url"
              placeholder={t("settings:SETTINGS_WORKSPACE_SKILLS_GITHUB_REPOSITORY_PLACEHOLDER")}
              aria-invalid={Boolean(form.formState.errors.repositoryUrl)}
              {...repositoryField}
              onChange={(event) => {
                void repositoryField.onChange(event);
                const identity = deriveGitHubSkillIdentity(event.target.value);
                if (!identity) return;
                form.setValue("slug", identity.slug);
                if (!form.getValues("displayName")) {
                  form.setValue("displayName", identity.displayName);
                }
              }}
              onBlur={(event) => {
                void repositoryField.onBlur(event);
              }}
            />
          </SettingDialogField>
          <details className="group rounded-xl border bg-card">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-footnote font-semibold text-label-primary">
              {t("settings:SETTINGS_WORKSPACE_SKILLS_GITHUB_OPTIONS_TITLE")}
              <ChevronDown
                className="size-4 transition-transform group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>
            <div className="grid gap-5 border-t p-4 sm:grid-cols-2">
              <SettingDialogField
                title={
                  <label htmlFor={`${formId}-ref`}>
                    {t("settings:SETTINGS_WORKSPACE_SKILLS_GITHUB_REF_LABEL")}
                  </label>
                }
                error={
                  form.formState.errors.requestedRef
                    ? t("settings:SETTINGS_WORKSPACE_SKILLS_GITHUB_REF_ERROR")
                    : undefined
                }
              >
                <Input
                  id={`${formId}-ref`}
                  className="font-mono"
                  placeholder={t("settings:SETTINGS_WORKSPACE_SKILLS_GITHUB_REF_PLACEHOLDER")}
                  aria-invalid={Boolean(form.formState.errors.requestedRef)}
                  {...form.register("requestedRef")}
                />
              </SettingDialogField>
              <SettingDialogField
                title={
                  <label htmlFor={`${formId}-subpath`}>
                    {t("settings:SETTINGS_WORKSPACE_SKILLS_GITHUB_SUBPATH_LABEL")}
                  </label>
                }
                error={
                  form.formState.errors.subpath
                    ? t("settings:SETTINGS_WORKSPACE_SKILLS_GITHUB_SUBPATH_ERROR")
                    : undefined
                }
              >
                <Input
                  id={`${formId}-subpath`}
                  className="font-mono"
                  placeholder={t("settings:SETTINGS_WORKSPACE_SKILLS_GITHUB_SUBPATH_PLACEHOLDER")}
                  aria-invalid={Boolean(form.formState.errors.subpath)}
                  {...form.register("subpath")}
                />
              </SettingDialogField>
            </div>
          </details>
          <div className="grid gap-5 sm:grid-cols-2">
            <SettingDialogField
              title={
                <label htmlFor={`${formId}-name`}>
                  {t("settings:SETTINGS_WORKSPACE_SKILLS_NAME_LABEL")}
                </label>
              }
              error={
                form.formState.errors.displayName
                  ? t("settings:SETTINGS_WORKSPACE_SKILLS_ACTION_REQUIRED")
                  : undefined
              }
            >
              <Input
                id={`${formId}-name`}
                placeholder={t("settings:SETTINGS_WORKSPACE_SKILLS_NAME_PLACEHOLDER")}
                aria-invalid={Boolean(form.formState.errors.displayName)}
                {...form.register("displayName")}
              />
            </SettingDialogField>
            <SettingDialogField
              title={
                <label htmlFor={`${formId}-description`}>
                  {t("settings:SETTINGS_WORKSPACE_SKILLS_DESCRIPTION_LABEL")}
                </label>
              }
              error={
                form.formState.errors.description
                  ? t("settings:SETTINGS_WORKSPACE_SKILLS_ACTION_REQUIRED")
                  : undefined
              }
            >
              <Textarea
                id={`${formId}-description`}
                className="min-h-24"
                placeholder={t("settings:SETTINGS_WORKSPACE_SKILLS_DESCRIPTION_PLACEHOLDER")}
                aria-invalid={Boolean(form.formState.errors.description)}
                {...form.register("description")}
              />
            </SettingDialogField>
          </div>
        </SettingDialogFields>
      </form>
    </SettingDialog>
  );
}
