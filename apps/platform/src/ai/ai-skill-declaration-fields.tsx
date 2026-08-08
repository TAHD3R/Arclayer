import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  PlatformSkillCatalogOptionOut,
  PlatformSkillCapabilitiesOut,
} from "@arclayer/platform-openapi";

import type { PlatformSkillVersionFormValues } from "@/ai/ai-skill-form-model";
import { SettingDialogField } from "@/components/setting-dialog-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type DeclarationField = "requiredTools" | "permissions" | "dataEgress" | "references";
type DeclarationErrors = Partial<Record<DeclarationField, string>>;
type CatalogOption = PlatformSkillCatalogOptionOut;
type Props = Readonly<{
  values: PlatformSkillVersionFormValues;
  errors: DeclarationErrors;
  capabilities: PlatformSkillCapabilitiesOut;
  onChange: (values: PlatformSkillVersionFormValues) => void;
}>;

export function PlatformSkillDeclarationFields({ values, errors, capabilities, onChange }: Props) {
  const { t } = useTranslation("ai");
  return (
    <>
      <DeclarationCollection
        addDisabled={capabilities.supportedTools.length === 0}
        addLabel={t("SKILL_FIELD_REQUIRED_TOOLS_ADD")}
        description={t("SKILL_FIELD_REQUIRED_TOOLS_DESCRIPTION")}
        error={errors.requiredTools}
        onAdd={() =>
          onChange({
            ...values,
            requiredTools: [
              ...values.requiredTools,
              {
                toolId: capabilities.supportedTools[0]?.id ?? "",
                versionRange: ">=1",
                intendedUse: "",
              },
            ],
          })
        }
        title={t("SKILL_FIELD_REQUIRED_TOOLS")}
      >
        {capabilities.supportedTools.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("SKILL_FIELD_REQUIRED_TOOLS_EMPTY")}</p>
        ) : null}
        {values.requiredTools.map((tool, index) => (
          <div className="grid gap-3 rounded-lg border p-3" key={`${tool.toolId}-${index}`}>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_auto]">
              <Select
                onValueChange={(toolId) =>
                  onChange({
                    ...values,
                    requiredTools: replaceAt(values.requiredTools, index, { ...tool, toolId }),
                  })
                }
                value={tool.toolId}
              >
                <SelectTrigger aria-label={t("SKILL_FIELD_TOOL_ID")}>
                  <SelectValue placeholder={t("SKILL_FIELD_TOOL_ID_PLACEHOLDER")} />
                </SelectTrigger>
                <SelectContent>
                  {capabilities.supportedTools.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      <div>
                        <div>{option.label}</div>
                        <div className="text-xs text-muted-foreground">{option.description}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                aria-label={t("SKILL_FIELD_TOOL_VERSION_RANGE")}
                onChange={(event) =>
                  onChange({
                    ...values,
                    requiredTools: replaceAt(values.requiredTools, index, {
                      ...tool,
                      versionRange: event.target.value,
                    }),
                  })
                }
                placeholder={t("SKILL_FIELD_TOOL_VERSION_RANGE_PLACEHOLDER")}
                value={tool.versionRange ?? ""}
              />
              <RemoveButton
                label={t("SKILL_FIELD_REQUIRED_TOOLS_REMOVE")}
                onClick={() =>
                  onChange({ ...values, requiredTools: removeAt(values.requiredTools, index) })
                }
              />
            </div>
            <Textarea
              aria-label={t("SKILL_FIELD_INTENDED_USE")}
              className="min-h-20"
              onChange={(event) =>
                onChange({
                  ...values,
                  requiredTools: replaceAt(values.requiredTools, index, {
                    ...tool,
                    intendedUse: event.target.value,
                  }),
                })
              }
              placeholder={t("SKILL_FIELD_INTENDED_USE_PLACEHOLDER")}
              value={tool.intendedUse}
            />
          </div>
        ))}
      </DeclarationCollection>

      <DeclarationCollection
        addLabel={t("SKILL_FIELD_PERMISSIONS_ADD")}
        description={t("SKILL_FIELD_PERMISSIONS_DESCRIPTION")}
        error={errors.permissions}
        onAdd={() =>
          onChange({ ...values, permissions: [...values.permissions, { action: "", purpose: "" }] })
        }
        title={t("SKILL_FIELD_PERMISSIONS")}
      >
        {values.permissions.map((permission, index) => (
          <div className="grid gap-3 rounded-lg border p-3" key={`${permission.action}-${index}`}>
            <div className="flex gap-3">
              <CatalogSelect
                ariaLabel={t("SKILL_FIELD_PERMISSION_ACTION")}
                onValueChange={(action) =>
                  onChange({
                    ...values,
                    permissions: replaceAt(values.permissions, index, { ...permission, action }),
                  })
                }
                options={capabilities.permissions}
                placeholder={t("SKILL_FIELD_PERMISSION_ACTION_PLACEHOLDER")}
                value={permission.action}
              />
              <RemoveButton
                label={t("SKILL_FIELD_PERMISSIONS_REMOVE")}
                onClick={() =>
                  onChange({ ...values, permissions: removeAt(values.permissions, index) })
                }
              />
            </div>
            <Textarea
              aria-label={t("SKILL_FIELD_PURPOSE")}
              className="min-h-20"
              onChange={(event) =>
                onChange({
                  ...values,
                  permissions: replaceAt(values.permissions, index, {
                    ...permission,
                    purpose: event.target.value,
                  }),
                })
              }
              placeholder={t("SKILL_FIELD_PURPOSE_PLACEHOLDER")}
              value={permission.purpose}
            />
          </div>
        ))}
      </DeclarationCollection>

      <DeclarationCollection
        addLabel={t("SKILL_FIELD_DATA_EGRESS_ADD")}
        description={t("SKILL_FIELD_DATA_EGRESS_DESCRIPTION")}
        error={errors.dataEgress}
        onAdd={() =>
          onChange({
            ...values,
            dataEgress: [...values.dataEgress, { destination: "", purpose: "", dataClasses: [] }],
          })
        }
        title={t("SKILL_FIELD_DATA_EGRESS")}
      >
        {values.dataEgress.map((egress, index) => (
          <div className="grid gap-3 rounded-lg border p-3" key={`${egress.destination}-${index}`}>
            <div className="flex gap-3">
              <CatalogSelect
                ariaLabel={t("SKILL_FIELD_EGRESS_DESTINATION")}
                onValueChange={(destination) =>
                  onChange({
                    ...values,
                    dataEgress: replaceAt(values.dataEgress, index, { ...egress, destination }),
                  })
                }
                options={capabilities.egressDestinations}
                placeholder={t("SKILL_FIELD_EGRESS_DESTINATION_PLACEHOLDER")}
                value={egress.destination}
              />
              <RemoveButton
                label={t("SKILL_FIELD_DATA_EGRESS_REMOVE")}
                onClick={() =>
                  onChange({ ...values, dataEgress: removeAt(values.dataEgress, index) })
                }
              />
            </div>
            <CatalogMultiSelect
              ariaLabel={t("SKILL_FIELD_DATA_CLASSES")}
              onChange={(dataClasses) =>
                onChange({
                  ...values,
                  dataEgress: replaceAt(values.dataEgress, index, { ...egress, dataClasses }),
                })
              }
              options={capabilities.dataClasses}
              placeholder={t("SKILL_FIELD_DATA_CLASSES_PLACEHOLDER")}
              selected={egress.dataClasses}
            />
            <Textarea
              aria-label={t("SKILL_FIELD_PURPOSE")}
              className="min-h-20"
              onChange={(event) =>
                onChange({
                  ...values,
                  dataEgress: replaceAt(values.dataEgress, index, {
                    ...egress,
                    purpose: event.target.value,
                  }),
                })
              }
              placeholder={t("SKILL_FIELD_PURPOSE_PLACEHOLDER")}
              value={egress.purpose}
            />
          </div>
        ))}
      </DeclarationCollection>

      <SettingDialogField
        description={t("SKILL_FIELD_CAPABILITY_TAGS_DESCRIPTION")}
        title={t("SKILL_FIELD_CAPABILITY_TAGS")}
      >
        <CatalogMultiSelect
          ariaLabel={t("SKILL_FIELD_CAPABILITY_TAGS")}
          onChange={(tags) => onChange({ ...values, capabilityTags: tags.join(", ") })}
          options={capabilities.capabilityTags}
          placeholder={t("SKILL_FIELD_CAPABILITY_TAGS_PLACEHOLDER")}
          selected={values.capabilityTags
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)}
        />
      </SettingDialogField>

      <DeclarationCollection
        addLabel={t("SKILL_FIELD_REFERENCES_ADD")}
        description={t("SKILL_FIELD_REFERENCES_DESCRIPTION")}
        error={errors.references}
        onAdd={() =>
          onChange({
            ...values,
            references: [
              ...values.references,
              { path: "", content: "", mimeType: "text/markdown" },
            ],
          })
        }
        title={t("SKILL_FIELD_REFERENCES")}
      >
        {values.references.map((reference, index) => (
          <div className="grid gap-3 rounded-lg border p-3" key={`${reference.path}-${index}`}>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto]">
              <Input
                aria-label={t("SKILL_FIELD_REFERENCE_PATH")}
                onChange={(event) =>
                  onChange({
                    ...values,
                    references: replaceAt(values.references, index, {
                      ...reference,
                      path: event.target.value,
                    }),
                  })
                }
                placeholder={t("SKILL_FIELD_REFERENCE_PATH_PLACEHOLDER")}
                value={reference.path}
              />
              <Select
                onValueChange={(mimeType: "text/markdown" | "text/plain" | "application/json") =>
                  onChange({
                    ...values,
                    references: replaceAt(values.references, index, { ...reference, mimeType }),
                  })
                }
                value={reference.mimeType ?? "text/markdown"}
              >
                <SelectTrigger aria-label={t("SKILL_FIELD_REFERENCE_TYPE")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {capabilities.referenceMimeTypes.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      <div>
                        <div>{option.label}</div>
                        <div className="text-xs text-muted-foreground">{option.description}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <RemoveButton
                label={t("SKILL_FIELD_REFERENCES_REMOVE")}
                onClick={() =>
                  onChange({ ...values, references: removeAt(values.references, index) })
                }
              />
            </div>
            <Textarea
              aria-label={t("SKILL_FIELD_REFERENCE_CONTENT")}
              className="min-h-32 font-mono text-xs leading-5"
              onChange={(event) =>
                onChange({
                  ...values,
                  references: replaceAt(values.references, index, {
                    ...reference,
                    content: event.target.value,
                  }),
                })
              }
              placeholder={t("SKILL_FIELD_REFERENCE_CONTENT_PLACEHOLDER")}
              value={reference.content}
            />
          </div>
        ))}
      </DeclarationCollection>
    </>
  );
}

function DeclarationCollection({
  title,
  description,
  error,
  addLabel,
  addDisabled = false,
  onAdd,
  children,
}: Readonly<{
  title: string;
  description: string;
  error?: string;
  addLabel: string;
  addDisabled?: boolean;
  onAdd: () => void;
  children: React.ReactNode;
}>) {
  return (
    <SettingDialogField description={description} error={error} title={title}>
      <div className="grid gap-3">
        {children}
        <Button
          className="w-fit"
          disabled={addDisabled}
          onClick={onAdd}
          size="sm"
          type="button"
          variant="outline"
        >
          <Plus aria-hidden="true" />
          {addLabel}
        </Button>
      </div>
    </SettingDialogField>
  );
}

function RemoveButton({ label, onClick }: Readonly<{ label: string; onClick: () => void }>) {
  return (
    <Button aria-label={label} onClick={onClick} size="icon" type="button" variant="ghost">
      <Trash2 aria-hidden="true" />
    </Button>
  );
}

function CatalogSelect(
  props: Readonly<{
    ariaLabel: string;
    options: readonly CatalogOption[];
    placeholder: string;
    value: string;
    onValueChange: (value: string) => void;
  }>,
) {
  return (
    <Select onValueChange={props.onValueChange} value={props.value}>
      <SelectTrigger aria-label={props.ariaLabel}>
        <SelectValue placeholder={props.placeholder} />
      </SelectTrigger>
      <SelectContent>
        {props.options.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            <div>
              <div>{option.label}</div>
              <div className="text-xs text-muted-foreground">{option.description}</div>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CatalogMultiSelect(
  props: Readonly<{
    ariaLabel: string;
    options: readonly CatalogOption[];
    placeholder: string;
    selected: readonly string[];
    onChange: (values: string[]) => void;
  }>,
) {
  const available = props.options.filter((option) => !props.selected.includes(option.id));
  return (
    <div className="space-y-2">
      <Select
        key={props.selected.join("|")}
        onValueChange={(value) => props.onChange([...props.selected, value])}
      >
        <SelectTrigger aria-label={props.ariaLabel}>
          <SelectValue placeholder={props.placeholder} />
        </SelectTrigger>
        <SelectContent>
          {available.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              <div>
                <div>{option.label}</div>
                <div className="text-xs text-muted-foreground">{option.description}</div>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {props.selected.length ? (
        <div className="flex flex-wrap gap-2">
          {props.selected.map((value) => (
            <Button
              key={value}
              onClick={() => props.onChange(props.selected.filter((item) => item !== value))}
              size="sm"
              type="button"
              variant="outline"
            >
              {value}
              <Trash2 aria-hidden="true" />
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function replaceAt<T>(values: readonly T[], index: number, value: T): T[] {
  return values.map((item, itemIndex) => (itemIndex === index ? value : item));
}

function removeAt<T>(values: readonly T[], index: number): T[] {
  return values.filter((_, itemIndex) => itemIndex !== index);
}
