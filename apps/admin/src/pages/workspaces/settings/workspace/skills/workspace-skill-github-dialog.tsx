import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { Github } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { SkillGitHubImportCreateRequest } from "@arclayer/openapi";
import { Alert, AlertDescription, AlertTitle } from "@arclayer/ui/alert";
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
            <Github data-icon="inline-start" />
            {t("settings:SETTINGS_WORKSPACE_SKILLS_GITHUB_IMPORT_ACTION")}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit}>
        <SettingDialogFields>
          <Alert>
            <Github aria-hidden="true" />
            <AlertTitle>{t("settings:SETTINGS_WORKSPACE_SKILLS_GITHUB_PUBLIC_TITLE")}</AlertTitle>
            <AlertDescription>
              {t("settings:SETTINGS_WORKSPACE_SKILLS_GITHUB_PUBLIC_DESC")}
            </AlertDescription>
          </Alert>
          <SettingDialogField
            title={
              <label htmlFor={`${formId}-repository`}>
                {t("settings:SETTINGS_WORKSPACE_SKILLS_GITHUB_REPOSITORY_LABEL")}
              </label>
            }
            description={t("settings:SETTINGS_WORKSPACE_SKILLS_GITHUB_REPOSITORY_HELP")}
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
              placeholder="https://github.com/acme/site-skill"
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
          <div className="grid gap-5 sm:grid-cols-2">
            <SettingDialogField
              title={
                <label htmlFor={`${formId}-ref`}>
                  {t("settings:SETTINGS_WORKSPACE_SKILLS_GITHUB_REF_LABEL")}
                </label>
              }
              description={t("settings:SETTINGS_WORKSPACE_SKILLS_GITHUB_REF_HELP")}
              error={
                form.formState.errors.requestedRef
                  ? t("settings:SETTINGS_WORKSPACE_SKILLS_ACTION_REQUIRED")
                  : undefined
              }
            >
              <Input
                id={`${formId}-ref`}
                className="font-mono"
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
              description={t("settings:SETTINGS_WORKSPACE_SKILLS_GITHUB_SUBPATH_HELP")}
              error={
                form.formState.errors.subpath
                  ? t("settings:SETTINGS_WORKSPACE_SKILLS_GITHUB_SUBPATH_ERROR")
                  : undefined
              }
            >
              <Input
                id={`${formId}-subpath`}
                className="font-mono"
                placeholder="skills/site-planner"
                aria-invalid={Boolean(form.formState.errors.subpath)}
                {...form.register("subpath")}
              />
            </SettingDialogField>
          </div>
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
              aria-invalid={Boolean(form.formState.errors.description)}
              {...form.register("description")}
            />
          </SettingDialogField>
        </SettingDialogFields>
      </form>
    </SettingDialog>
  );
}
