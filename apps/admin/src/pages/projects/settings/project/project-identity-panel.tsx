import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { ProjectAvatar, projectAvatarPropsFromIdentity } from "@/components/common/project-avatar";
import { zodResolver } from "@/lib/forms/zod-resolver";
import type { ProjectOut as Project } from "@arclayer/openapi";
import { Button } from "@arclayer/ui/button";
import { FieldError } from "@arclayer/ui/field";
import { Input } from "@arclayer/ui/input";
import { Textarea } from "@arclayer/ui/textarea";

export const PROJECT_NAME_MAX_LENGTH = 128;
export const PROJECT_DESCRIPTION_MAX_LENGTH = 256;

type ProjectIdentityValues = {
  name: string;
  description: string;
};

function buildProjectIdentitySchema(t: ReturnType<typeof useTranslation>["t"]) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, t("account:ACCOUNT_PROJECTS_FIELD_NAME_REQUIRED"))
      .max(
        PROJECT_NAME_MAX_LENGTH,
        t("account:ACCOUNT_PROJECTS_FIELD_NAME_MAX", { max: PROJECT_NAME_MAX_LENGTH }),
      ),
    description: z.string().max(
      PROJECT_DESCRIPTION_MAX_LENGTH,
      t("account:ACCOUNT_PROJECTS_FIELD_DESCRIPTION_MAX", {
        max: PROJECT_DESCRIPTION_MAX_LENGTH,
      }),
    ),
  });
}

export function ProjectIdentityPanel(props: {
  project: Project;
  disabled: boolean;
  savePending: boolean;
  onEditIcon: () => void;
  onSave: (values: ProjectIdentityValues) => Promise<void>;
}) {
  const { t } = useTranslation(["account", "settings"]);
  const schema = useMemo(() => buildProjectIdentitySchema(t), [t]);
  const [saveState, setSaveState] = useState<"idle" | "saved">("idle");
  const form = useForm<ProjectIdentityValues>({
    resolver: zodResolver(schema),
    mode: "onSubmit",
    defaultValues: {
      name: props.project.name,
      description: props.project.description ?? "",
    },
  });
  const nameValue = form.watch("name");
  const descriptionValue = form.watch("description");

  useEffect(() => {
    form.reset({
      name: props.project.name,
      description: props.project.description ?? "",
    });
    setSaveState("idle");
  }, [form, props.project.description, props.project.id, props.project.name]);

  const submitIdentity = form.handleSubmit(async (values) => {
    try {
      await props.onSave({
        name: values.name,
        description: values.description.trim(),
      });
      form.reset({
        name: values.name,
        description: values.description.trim(),
      });
      setSaveState("saved");
    } catch {
      setSaveState("idle");
    }
  });

  const statusText = props.savePending
    ? t("account:SETTINGS_PROJECT_IDENTITY_SAVING")
    : form.formState.isDirty
      ? t("account:SETTINGS_PROJECT_IDENTITY_UNSAVED")
      : saveState === "saved"
        ? t("account:SETTINGS_PROJECT_IDENTITY_SAVED")
        : t("account:SETTINGS_PROJECT_IDENTITY_SYNCED");

  return (
    <form
      id="project-identity"
      className="min-w-0"
      onSubmit={(event) => void submitIdentity(event)}
      noValidate
    >
      <header>
        <h2 className="text-title2 font-semibold text-label-primary">
          {t("account:SETTINGS_PROJECT_IDENTITY_TITLE")}
        </h2>
        <p className="mt-1 max-w-2xl text-body text-label-secondary">
          {t("account:SETTINGS_PROJECT_IDENTITY_DESC")}
        </p>
      </header>

      <div className="mt-6 flex flex-col gap-4 border-y border-border py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <ProjectAvatar
            name={props.project.name}
            size={48}
            {...projectAvatarPropsFromIdentity(props.project)}
          />
          <div className="min-w-0">
            <div className="text-headline font-medium text-label-primary">
              {t("account:SETTINGS_PROJECT_ICON_TITLE")}
            </div>
            <div className="text-footnote text-label-secondary">
              {t("account:SETTINGS_PROJECT_ICON_DESC")}
            </div>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="project-icon-action"
          disabled={props.disabled}
          onClick={props.onEditIcon}
        >
          {t("settings:SETTINGS_EDIT")}
        </Button>
      </div>

      <div className="grid gap-5 py-6">
        <div className="grid content-start gap-2">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="project-name-input" className="text-headline text-label-primary">
              {t("account:ACCOUNT_PROJECTS_FIELD_NAME")}
            </label>
            <span className="text-caption tabular-nums text-label-secondary">
              {nameValue.length}/{PROJECT_NAME_MAX_LENGTH}
            </span>
          </div>
          <p id="project-name-help" className="text-footnote text-label-secondary">
            {t("account:ACCOUNT_PROJECTS_FIELD_NAME_DESC")}
          </p>
          <Input
            {...form.register("name", { onChange: () => setSaveState("idle") })}
            id="project-name-input"
            data-testid="project-name-input"
            maxLength={PROJECT_NAME_MAX_LENGTH}
            disabled={props.disabled}
            placeholder={t("account:ACCOUNT_PROJECTS_FIELD_NAME_PLACEHOLDER")}
            aria-invalid={Boolean(form.formState.errors.name)}
            aria-describedby={
              form.formState.errors.name
                ? "project-name-help project-name-error"
                : "project-name-help"
            }
            autoComplete="off"
          />
          {form.formState.errors.name?.message ? (
            <FieldError id="project-name-error">{form.formState.errors.name.message}</FieldError>
          ) : null}
        </div>

        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="project-description-input" className="text-headline text-label-primary">
              {t("account:ACCOUNT_PROJECTS_FIELD_DESCRIPTION")}
            </label>
            <span className="text-caption tabular-nums text-label-secondary">
              {descriptionValue.length}/{PROJECT_DESCRIPTION_MAX_LENGTH}
            </span>
          </div>
          <p id="project-description-help" className="text-footnote text-label-secondary">
            {t("account:ACCOUNT_PROJECTS_FIELD_DESCRIPTION_DESC")}
          </p>
          <Textarea
            {...form.register("description", { onChange: () => setSaveState("idle") })}
            id="project-description-input"
            data-testid="project-description-input"
            rows={4}
            maxLength={PROJECT_DESCRIPTION_MAX_LENGTH}
            disabled={props.disabled}
            placeholder={t("account:ACCOUNT_PROJECTS_FIELD_DESCRIPTION_PLACEHOLDER")}
            aria-invalid={Boolean(form.formState.errors.description)}
            aria-describedby={
              form.formState.errors.description
                ? "project-description-help project-description-error"
                : "project-description-help"
            }
          />
          {form.formState.errors.description?.message ? (
            <FieldError id="project-description-error">
              {form.formState.errors.description.message}
            </FieldError>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p
          id="project-identity-save-status"
          className="text-footnote text-label-secondary"
          aria-live="polite"
          data-testid="project-identity-save-status"
        >
          {statusText}
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={!form.formState.isDirty || props.disabled}
            onClick={() => {
              form.reset({
                name: props.project.name,
                description: props.project.description ?? "",
              });
              setSaveState("idle");
            }}
          >
            {t("account:SETTINGS_PROJECT_IDENTITY_RESET_ACTION")}
          </Button>
          <Button
            type="submit"
            loading={props.savePending}
            disabled={!form.formState.isDirty || props.disabled}
            aria-describedby="project-identity-save-status"
          >
            {t("account:SETTINGS_PROJECT_IDENTITY_SAVE_ACTION")}
          </Button>
        </div>
      </div>
    </form>
  );
}
