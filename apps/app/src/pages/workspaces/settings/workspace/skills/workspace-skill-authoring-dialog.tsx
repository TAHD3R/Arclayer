import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { Controller, useForm, type UseFormReturn } from "react-hook-form";
import { useTranslation } from "react-i18next";

import type {
  SkillPackageCreateRequest,
  SkillPackageDetailOut,
  SkillVersionCreateRequest,
  SkillVersionDetailOut,
} from "@arclayer/openapi";
import { Button } from "@arclayer/ui/button";
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@arclayer/ui/drawer";
import { Input } from "@arclayer/ui/input";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { SettingDialogField, SettingDialogFields } from "@arclayer/ui/setting-dialog-field";
import { Textarea } from "@arclayer/ui/textarea";

import { MarkdownPlateEditor } from "@/components/editor/markdown-plate-editor";
import { zodResolver } from "@/lib/forms/zod-resolver";
import {
  skillAuthoringDefaults,
  skillAuthoringSchema,
  deriveSkillSlug,
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
  const nameField = props.form.register("displayName");
  const nameHelpId = `${props.formId}-name-help`;
  const descriptionHelpId = `${props.formId}-description-help`;
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
        <div className="grid gap-2">
          <Input
            id={`${props.formId}-name`}
            aria-describedby={nameHelpId}
            autoFocus
            placeholder={t("SETTINGS_WORKSPACE_SKILLS_NAME_PLACEHOLDER")}
            aria-invalid={Boolean(props.form.formState.errors.displayName)}
            {...nameField}
            onChange={(event) => {
              void nameField.onChange(event);
              if (!props.form.getFieldState("slug").isDirty) {
                props.form.setValue("slug", deriveSkillSlug(event.target.value), {
                  shouldValidate: true,
                });
              }
            }}
          />
          <p id={nameHelpId} className="text-label-secondary">
            {t("SETTINGS_WORKSPACE_SKILLS_NAME_HELP")}
          </p>
        </div>
      </SettingDialogField>
      <SettingDialogField
        title={
          <label htmlFor={`${props.formId}-description`}>
            {t("SETTINGS_WORKSPACE_SKILLS_DESCRIPTION_LABEL")}
          </label>
        }
        error={
          fieldError(props.form, "description")
            ? t("SETTINGS_WORKSPACE_SKILLS_ACTION_REQUIRED")
            : undefined
        }
      >
        <div className="grid gap-2">
          <Textarea
            id={`${props.formId}-description`}
            aria-describedby={descriptionHelpId}
            className="min-h-24"
            placeholder={t("SETTINGS_WORKSPACE_SKILLS_DESCRIPTION_PLACEHOLDER")}
            aria-invalid={Boolean(props.form.formState.errors.description)}
            {...props.form.register("description")}
          />
          <p id={descriptionHelpId} className="text-label-secondary">
            {t("SETTINGS_WORKSPACE_SKILLS_DESCRIPTION_HELP")}
          </p>
        </div>
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
  const instructionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (props.open) form.reset(skillAuthoringDefaults(props.package, props.sourceVersion));
  }, [form, props.open, props.package, props.sourceVersion]);

  const isPackage = props.mode === "package";
  const instructionsId = `${formId}-instructions`;
  const instructionsErrorId = `${instructionsId}-error`;
  const instructionsInvalid = fieldError(form, "instructions");
  const submit = form.handleSubmit(
    async (values) => {
      await props.onSubmit(values);
      props.onOpenChange(false);
    },
    (errors) => {
      if (errors.instructions) instructionsRef.current?.focus();
    },
  );
  const title = t(
    isPackage
      ? "settings:SETTINGS_WORKSPACE_SKILLS_WRITE_MANUALLY"
      : "settings:SETTINGS_WORKSPACE_SKILLS_VERSION_CREATE_TITLE",
  );
  const description = t(
    isPackage
      ? "settings:SETTINGS_WORKSPACE_SKILLS_WRITE_MANUALLY_DESC"
      : "settings:SETTINGS_WORKSPACE_SKILLS_VERSION_CREATE_DESC",
  );
  const footer = (
    <>
      <Button variant="ghost" disabled={props.pending} onClick={() => props.onOpenChange(false)}>
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
  );
  const formContent = (
    <form id={formId} onSubmit={submit}>
      <SettingDialogFields>
        {isPackage ? <PackageIdentityFields formId={formId} form={form} /> : null}
        <SettingDialogField
          title={
            <label htmlFor={instructionsId}>
              {t("settings:SETTINGS_WORKSPACE_SKILLS_INSTRUCTIONS_LABEL")}
            </label>
          }
          description={t("settings:SETTINGS_WORKSPACE_SKILLS_INSTRUCTIONS_HELP")}
          error={
            instructionsInvalid ? (
              <div id={instructionsErrorId} role="alert" className="text-footnote text-destructive">
                {t("settings:SETTINGS_WORKSPACE_SKILLS_ACTION_REQUIRED")}
              </div>
            ) : undefined
          }
        >
          <Controller
            control={form.control}
            name="instructions"
            render={({ field }) => (
              <MarkdownPlateEditor
                id={instructionsId}
                editorRef={instructionsRef}
                ariaDescribedBy={instructionsInvalid ? instructionsErrorId : undefined}
                ariaInvalid={instructionsInvalid}
                ariaLabel={t("settings:SETTINGS_WORKSPACE_SKILLS_INSTRUCTIONS_LABEL")}
                compact
                disabled={props.pending}
                exportFilename="SKILL.md"
                onBlur={field.onBlur}
                onChange={field.onChange}
                placeholder={t("settings:SETTINGS_WORKSPACE_SKILLS_INSTRUCTIONS_PLACEHOLDER")}
                toolbarAriaLabel={t(
                  "settings:SETTINGS_WORKSPACE_SKILLS_INSTRUCTIONS_TOOLBAR_LABEL",
                )}
                value={field.value}
              />
            )}
          />
        </SettingDialogField>
        {isPackage ? null : (
          <>
            <WorkspaceSkillReferenceFields form={form} />
            <WorkspaceSkillAdvancedFields form={form} showIdentifier={false} />
          </>
        )}
      </SettingDialogFields>
    </form>
  );

  if (isPackage) {
    return (
      <Drawer open={props.open} onOpenChange={props.onOpenChange} direction="right">
        <DrawerContent
          className="w-full! sm:w-1/2! sm:max-w-none!"
          overlayClassName="backdrop-blur-sm"
          showCloseButton={false}
        >
          <DrawerHeader className="max-w-none! px-6 py-5">
            <div className="flex min-w-0 items-center gap-3">
              <DrawerTitle
                unstyled
                className="min-w-0 flex-1 text-title3 font-semibold text-label-primary"
              >
                {title}
              </DrawerTitle>
              <DrawerClose asChild>
                <Button
                  aria-label={t("common:CLOSE")}
                  disabled={props.pending}
                  size="icon-sm"
                  variant="ghost"
                >
                  <X aria-hidden="true" />
                </Button>
              </DrawerClose>
            </div>
            <DrawerDescription className="text-body">{description}</DrawerDescription>
          </DrawerHeader>
          <DrawerBody className="min-h-0 max-w-none! flex-1 overflow-y-auto px-6 py-5">
            {formContent}
          </DrawerBody>
          <DrawerFooter className="max-w-none! flex justify-end px-6 py-5">{footer}</DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={title}
      description={description}
      contentClassName="sm:max-w-3xl"
      preventInitialFocus={false}
      footer={footer}
    >
      {formContent}
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
