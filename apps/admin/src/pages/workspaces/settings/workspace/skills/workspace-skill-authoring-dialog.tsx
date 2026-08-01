import { useEffect } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { useTranslation } from "react-i18next";

import type {
  SkillPackageCreateRequest,
  SkillPackageDetailOut,
  SkillVersionCreateRequest,
  SkillVersionDetailOut,
} from "@arclayer/openapi";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { SettingDialogField, SettingDialogFields } from "@arclayer/ui/setting-dialog-field";
import { Textarea } from "@arclayer/ui/textarea";

import { zodResolver } from "@/lib/forms/zod-resolver";
import {
  skillAuthoringDefaults,
  skillAuthoringSchema,
  toSkillVersionPayload,
  type SkillAuthoringValues,
} from "./workspace-skill-authoring-model";
import {
  WorkspaceSkillAdvancedFields,
  WorkspaceSkillReferenceFields,
} from "./workspace-skill-declaration-fields";

type DialogStateProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
};

type AuthoringDialogProps = DialogStateProps & {
  mode: "package" | "version";
  package?: SkillPackageDetailOut;
  sourceVersion?: SkillVersionDetailOut;
  onSubmit: (values: SkillAuthoringValues) => Promise<void>;
};

function fieldError(
  form: UseFormReturn<SkillAuthoringValues>,
  path: keyof SkillAuthoringValues,
): boolean {
  return Boolean(form.formState.errors[path]);
}

function PackageIdentityFields(props: {
  formId: string;
  form: UseFormReturn<SkillAuthoringValues>;
}) {
  const { t } = useTranslation("settings");
  return (
    <>
      <SettingDialogField
        title={
          <label htmlFor={`${props.formId}-name`}>
            {t("SETTINGS_WORKSPACE_SKILLS_NAME_LABEL")}
          </label>
        }
        error={
          fieldError(props.form, "displayName")
            ? t("SETTINGS_WORKSPACE_SKILLS_ACTION_REQUIRED")
            : undefined
        }
      >
        <Input
          id={`${props.formId}-name`}
          autoFocus
          aria-invalid={Boolean(props.form.formState.errors.displayName)}
          {...props.form.register("displayName")}
        />
      </SettingDialogField>
      <SettingDialogField
        title={
          <label htmlFor={`${props.formId}-description`}>
            {t("SETTINGS_WORKSPACE_SKILLS_DESCRIPTION_LABEL")}
          </label>
        }
      >
        <Textarea
          id={`${props.formId}-description`}
          className="min-h-24"
          aria-invalid={Boolean(props.form.formState.errors.description)}
          {...props.form.register("description")}
        />
      </SettingDialogField>
    </>
  );
}

function SkillAuthoringDialog(props: AuthoringDialogProps) {
  const { t } = useTranslation(["settings", "common"]);
  const formId = `workspace-skill-${props.mode}-form`;
  const form = useForm<SkillAuthoringValues>({
    resolver: zodResolver(skillAuthoringSchema),
    defaultValues: skillAuthoringDefaults(props.package, props.sourceVersion),
  });

  useEffect(() => {
    if (props.open) form.reset(skillAuthoringDefaults(props.package, props.sourceVersion));
  }, [form, props.open, props.package, props.sourceVersion]);

  const submit = form.handleSubmit(async (values) => {
    await props.onSubmit(values);
    props.onOpenChange(false);
  });
  const isPackage = props.mode === "package";

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t(
        isPackage
          ? "settings:SETTINGS_WORKSPACE_SKILLS_CREATE_TITLE"
          : "settings:SETTINGS_WORKSPACE_SKILLS_VERSION_CREATE_TITLE",
      )}
      description={t(
        isPackage
          ? "settings:SETTINGS_WORKSPACE_SKILLS_CREATE_DESC"
          : "settings:SETTINGS_WORKSPACE_SKILLS_VERSION_CREATE_DESC",
      )}
      contentClassName="sm:max-w-3xl"
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
          <Button type="submit" form={formId} loading={props.pending}>
            {t(
              isPackage
                ? "settings:SETTINGS_WORKSPACE_SKILLS_CREATE_ACTION"
                : "settings:SETTINGS_WORKSPACE_SKILLS_VERSION_CREATE_ACTION",
            )}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit}>
        <SettingDialogFields>
          {isPackage ? <PackageIdentityFields formId={formId} form={form} /> : null}
          <SettingDialogField
            title={
              <label htmlFor={`${formId}-instructions`}>
                {t("settings:SETTINGS_WORKSPACE_SKILLS_INSTRUCTIONS_LABEL")}
              </label>
            }
            description={t("settings:SETTINGS_WORKSPACE_SKILLS_INSTRUCTIONS_HELP")}
            error={
              fieldError(form, "instructions")
                ? t("settings:SETTINGS_WORKSPACE_SKILLS_ACTION_REQUIRED")
                : undefined
            }
          >
            <Textarea
              id={`${formId}-instructions`}
              autoFocus={!isPackage}
              className="min-h-64"
              aria-invalid={Boolean(form.formState.errors.instructions)}
              {...form.register("instructions")}
            />
          </SettingDialogField>
          <WorkspaceSkillReferenceFields form={form} />
          <WorkspaceSkillAdvancedFields form={form} showIdentifier={isPackage} />
        </SettingDialogFields>
      </form>
    </SettingDialog>
  );
}

export function WorkspaceSkillPackageCreateDialog(
  props: DialogStateProps & {
    onSubmit: (payload: SkillPackageCreateRequest) => Promise<void>;
  },
) {
  return (
    <SkillAuthoringDialog
      {...props}
      mode="package"
      onSubmit={(values) =>
        props.onSubmit({
          ...toSkillVersionPayload(values),
          displayName: values.displayName.trim(),
          slug: values.slug.trim(),
          description: values.description.trim(),
        })
      }
    />
  );
}

export function WorkspaceSkillVersionCreateDialog(
  props: DialogStateProps & {
    package?: SkillPackageDetailOut;
    sourceVersion?: SkillVersionDetailOut;
    onSubmit: (payload: SkillVersionCreateRequest) => Promise<void>;
  },
) {
  return (
    <SkillAuthoringDialog
      {...props}
      mode="version"
      onSubmit={(values) => props.onSubmit(toSkillVersionPayload(values))}
    />
  );
}
