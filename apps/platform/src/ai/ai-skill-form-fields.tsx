import { useTranslation } from "react-i18next";
import type { PlatformSkillCapabilitiesOut } from "@arclayer/platform-openapi";

import type {
  PlatformSkillCreateFormValues,
  PlatformSkillVersionFormValues,
} from "@/ai/ai-skill-form-model";
import { PlatformSkillDeclarationFields } from "@/ai/ai-skill-declaration-fields";
import { SettingDialogField, SettingDialogFields } from "@/components/setting-dialog-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type FieldErrors = Partial<Record<keyof PlatformSkillCreateFormValues, string>>;

export function PlatformSkillPackageFields({
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
    <SettingDialogFields>
      <SettingDialogField error={errors.displayName} title={t("SKILL_FIELD_NAME")}>
        <Input
          autoComplete="off"
          onChange={(event) => onChange({ ...values, displayName: event.target.value })}
          placeholder={t("SKILL_FIELD_NAME_PLACEHOLDER")}
          value={values.displayName}
        />
      </SettingDialogField>
      <SettingDialogField
        description={t("SKILL_FIELD_SLUG_DESCRIPTION")}
        error={errors.slug}
        title={t("SKILL_FIELD_SLUG")}
      >
        <Input
          autoCapitalize="none"
          autoComplete="off"
          readOnly={slugReadOnly}
          onChange={(event) => onChange({ ...values, slug: event.target.value })}
          placeholder={t("SKILL_FIELD_SLUG_PLACEHOLDER")}
          value={values.slug}
        />
      </SettingDialogField>
      <SettingDialogField error={errors.description} title={t("SKILL_FIELD_DESCRIPTION")}>
        <Textarea
          className="min-h-24"
          onChange={(event) => onChange({ ...values, description: event.target.value })}
          placeholder={t("SKILL_FIELD_DESCRIPTION_PLACEHOLDER")}
          value={values.description}
        />
      </SettingDialogField>
    </SettingDialogFields>
  );
}

export function PlatformSkillVersionFields({
  values,
  errors,
  onChange,
  capabilities,
}: Readonly<{
  values: PlatformSkillVersionFormValues;
  errors: FieldErrors;
  onChange: (values: PlatformSkillVersionFormValues) => void;
  capabilities: PlatformSkillCapabilitiesOut;
}>) {
  const { t } = useTranslation("ai");
  return (
    <SettingDialogFields>
      <SettingDialogField
        description={t("SKILL_FIELD_SEMANTIC_VERSION_DESCRIPTION")}
        error={errors.semanticVersion}
        title={t("SKILL_FIELD_SEMANTIC_VERSION")}
      >
        <Input
          autoComplete="off"
          onChange={(event) => onChange({ ...values, semanticVersion: event.target.value })}
          placeholder={t("SKILL_FIELD_SEMANTIC_VERSION_PLACEHOLDER")}
          value={values.semanticVersion}
        />
      </SettingDialogField>
      <SettingDialogField
        description={t("SKILL_FIELD_INSTRUCTIONS_DESCRIPTION")}
        error={errors.instructions}
        title={t("SKILL_FIELD_INSTRUCTIONS")}
      >
        <Textarea
          className="min-h-56 font-mono text-xs leading-5"
          onChange={(event) => onChange({ ...values, instructions: event.target.value })}
          placeholder={t("SKILL_FIELD_INSTRUCTIONS_PLACEHOLDER")}
          value={values.instructions}
        />
      </SettingDialogField>
      <PlatformSkillDeclarationFields
        errors={errors}
        onChange={onChange}
        capabilities={capabilities}
        values={values}
      />
    </SettingDialogFields>
  );
}
