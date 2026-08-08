import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  PlatformSkillPackageCreateRequest,
  PlatformSkillPackageDetailOut,
  PlatformSkillPackageReplaceRequest,
  PlatformSkillCapabilitiesOut,
  PlatformSkillVersionCreateRequest,
} from "@arclayer/platform-openapi";

import { PlatformSkillPackageFields, PlatformSkillVersionFields } from "@/ai/ai-skill-form-fields";
import {
  EMPTY_PLATFORM_SKILL_CREATE_VALUES,
  PlatformSkillFormError,
  editFormValues,
  latestPlatformSkillVersion,
  toPlatformSkillCreateRequest,
  toPlatformSkillReplaceRequest,
  toPlatformSkillVersionRequest,
  versionFormValues,
  type PlatformSkillCreateFormValues,
  type PlatformSkillVersionFormValues,
} from "@/ai/ai-skill-form-model";
import { SettingDialog } from "@/components/setting-dialog";
import { Button } from "@/components/ui/button";

type FieldErrors = Partial<Record<keyof PlatformSkillCreateFormValues, string>>;
type CommonDialogProps = Readonly<{
  open: boolean;
  pending: boolean;
  capabilities: PlatformSkillCapabilitiesOut;
  onOpenChange: (open: boolean) => void;
}>;

function fieldError(error: unknown, message: string): FieldErrors {
  return error instanceof PlatformSkillFormError ? { [error.field]: message } : {};
}

export function PlatformSkillCreateDialog({
  open,
  pending,
  capabilities,
  onOpenChange,
  onSubmit,
}: CommonDialogProps &
  Readonly<{ onSubmit: (payload: PlatformSkillPackageCreateRequest) => Promise<void> }>) {
  const { t } = useTranslation("ai");
  const [values, setValues] = useState(EMPTY_PLATFORM_SKILL_CREATE_VALUES);
  const [errors, setErrors] = useState<FieldErrors>({});
  useEffect(() => {
    if (open) {
      setValues(EMPTY_PLATFORM_SKILL_CREATE_VALUES);
      setErrors({});
    }
  }, [open]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setErrors({});
      void onSubmit(toPlatformSkillCreateRequest(values));
    } catch (error) {
      setErrors(fieldError(error, t("SKILL_FIELD_INVALID")));
    }
  }

  return (
    <SkillFormDialog
      description={t("SKILL_CREATE_DESCRIPTION")}
      formId="platform-skill-create-form"
      onOpenChange={onOpenChange}
      open={open}
      pending={pending}
      submitLabel={t("SKILL_CREATE_ACTION")}
      title={t("SKILL_CREATE_TITLE")}
    >
      <form className="space-y-7" id="platform-skill-create-form" onSubmit={submit}>
        <PackageSection errors={errors} onChange={setValues} values={values} />
        <VersionSection
          description={t("SKILL_VERSION_SECTION_DESCRIPTION")}
          errors={errors}
          onChange={(versionValues) => setValues((current) => ({ ...current, ...versionValues }))}
          capabilities={capabilities}
          title={t("SKILL_VERSION_SECTION_TITLE")}
          values={values}
        />
      </form>
    </SkillFormDialog>
  );
}

export function PlatformSkillMetadataDialog({
  skill,
  open,
  pending,
  capabilities,
  onOpenChange,
  onSubmit,
}: CommonDialogProps &
  Readonly<{
    skill: PlatformSkillPackageDetailOut | null;
    onSubmit: (payload: PlatformSkillPackageReplaceRequest) => Promise<void>;
  }>) {
  const { t } = useTranslation("ai");
  const [values, setValues] = useState<PlatformSkillCreateFormValues>(
    EMPTY_PLATFORM_SKILL_CREATE_VALUES,
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  useEffect(() => {
    if (open && skill) {
      setValues(editFormValues(skill));
      setErrors({});
    }
  }, [open, skill]);
  if (!skill) return null;
  const metadataRevision = skill.metadataRevision;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setErrors({});
      void onSubmit(toPlatformSkillReplaceRequest(values, metadataRevision));
    } catch (error) {
      setErrors(fieldError(error, t("SKILL_FIELD_INVALID")));
    }
  }

  const name = skill.displayNameKey ? t(skill.displayNameKey) : skill.displayName;
  return (
    <SkillFormDialog
      description={t("SKILL_EDIT_DESCRIPTION")}
      formId="platform-skill-edit-form"
      onOpenChange={onOpenChange}
      open={open}
      pending={pending}
      submitLabel={t("SAVE")}
      title={t("SKILL_EDIT_TITLE", { name })}
    >
      <form className="space-y-7" id="platform-skill-edit-form" onSubmit={submit}>
        <PackageSection errors={errors} onChange={setValues} slugReadOnly values={values} />
        <VersionSection
          description={t("SKILL_EDIT_CONTENT_DESCRIPTION")}
          errors={errors}
          onChange={(versionValues) => setValues((current) => ({ ...current, ...versionValues }))}
          capabilities={capabilities}
          title={t("SKILL_EDIT_CONTENT_TITLE")}
          values={values}
        />
      </form>
    </SkillFormDialog>
  );
}

export function PlatformSkillVersionDialog({
  skill,
  open,
  pending,
  capabilities,
  onOpenChange,
  onSubmit,
}: CommonDialogProps &
  Readonly<{
    skill: PlatformSkillPackageDetailOut | null;
    onSubmit: (payload: PlatformSkillVersionCreateRequest) => Promise<void>;
  }>) {
  const { t } = useTranslation("ai");
  const [values, setValues] = useState<PlatformSkillVersionFormValues>(versionFormValues());
  const [errors, setErrors] = useState<FieldErrors>({});
  useEffect(() => {
    if (open && skill) {
      setValues(versionFormValues(latestPlatformSkillVersion(skill)));
      setErrors({});
    }
  }, [open, skill]);
  if (!skill) return null;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setErrors({});
      void onSubmit(toPlatformSkillVersionRequest(values));
    } catch (error) {
      setErrors(fieldError(error, t("SKILL_FIELD_INVALID")));
    }
  }

  return (
    <SkillFormDialog
      description={t("SKILL_VERSION_CREATE_DESCRIPTION", {
        name: skill.displayNameKey ? t(skill.displayNameKey) : skill.displayName,
      })}
      formId="platform-skill-version-form"
      onOpenChange={onOpenChange}
      open={open}
      pending={pending}
      submitLabel={t("SKILL_VERSION_CREATE_ACTION")}
      title={t("SKILL_VERSION_CREATE_TITLE")}
    >
      <form id="platform-skill-version-form" onSubmit={submit}>
        <PlatformSkillVersionFields
          errors={errors}
          onChange={setValues}
          capabilities={capabilities}
          values={values}
        />
      </form>
    </SkillFormDialog>
  );
}

function SkillFormDialog({
  title,
  description,
  formId,
  submitLabel,
  open,
  pending,
  onOpenChange,
  children,
}: Readonly<{
  title: string;
  description: string;
  formId: string;
  submitLabel: string;
  open: boolean;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}>) {
  const { t } = useTranslation("ai");
  return (
    <SettingDialog
      bodyClassName="space-y-7"
      contentClassName="sm:max-w-3xl"
      description={description}
      footer={
        <>
          <Button disabled={pending} onClick={() => onOpenChange(false)} variant="outline">
            {t("CANCEL")}
          </Button>
          <Button form={formId} loading={pending} type="submit">
            {submitLabel}
          </Button>
        </>
      }
      onOpenChange={onOpenChange}
      open={open}
      title={title}
    >
      {children}
    </SettingDialog>
  );
}

function PackageSection({
  values,
  errors,
  onChange,
  slugReadOnly = false,
}: Readonly<{
  values: PlatformSkillCreateFormValues;
  errors: FieldErrors;
  onChange: (values: PlatformSkillCreateFormValues) => void;
  slugReadOnly?: boolean;
}>) {
  const { t } = useTranslation("ai");
  return (
    <section className="space-y-4">
      <FormSectionHeader
        description={t("SKILL_PACKAGE_SECTION_DESCRIPTION")}
        title={t("SKILL_PACKAGE_SECTION_TITLE")}
      />
      <PlatformSkillPackageFields
        errors={errors}
        onChange={onChange}
        slugReadOnly={slugReadOnly}
        values={values}
      />
    </section>
  );
}

function VersionSection({
  title,
  description,
  ...props
}: Readonly<{
  title: string;
  description: string;
  values: PlatformSkillVersionFormValues;
  errors: FieldErrors;
  capabilities: PlatformSkillCapabilitiesOut;
  onChange: (values: PlatformSkillVersionFormValues) => void;
}>) {
  return (
    <section className="space-y-4 border-t pt-6">
      <FormSectionHeader description={description} title={title} />
      <PlatformSkillVersionFields {...props} />
    </section>
  );
}

function FormSectionHeader({
  title,
  description,
}: Readonly<{ title: string; description: string }>) {
  return (
    <div className="space-y-1">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
