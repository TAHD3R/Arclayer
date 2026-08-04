import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

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
type Props = Readonly<{
  values: PlatformSkillVersionFormValues;
  errors: DeclarationErrors;
  supportedToolIds: readonly string[];
  onChange: (values: PlatformSkillVersionFormValues) => void;
}>;

export function PlatformSkillDeclarationFields({
  values,
  errors,
  supportedToolIds,
  onChange,
}: Props) {
  const { t } = useTranslation("ai");
  return (
    <>
      <DeclarationCollection
        addDisabled={supportedToolIds.length === 0}
        addLabel={t("SKILL_FIELD_REQUIRED_TOOLS_ADD")}
        description={t("SKILL_FIELD_REQUIRED_TOOLS_DESCRIPTION")}
        error={errors.requiredTools}
        onAdd={() =>
          onChange({
            ...values,
            requiredTools: [
              ...values.requiredTools,
              { toolId: supportedToolIds[0] ?? "", versionRange: ">=1", intendedUse: "" },
            ],
          })
        }
        title={t("SKILL_FIELD_REQUIRED_TOOLS")}
      >
        {supportedToolIds.length === 0 ? (
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
                  {supportedToolIds.map((toolId) => (
                    <SelectItem key={toolId} value={toolId}>
                      {toolId}
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
              <Input
                aria-label={t("SKILL_FIELD_PERMISSION_ACTION")}
                onChange={(event) =>
                  onChange({
                    ...values,
                    permissions: replaceAt(values.permissions, index, {
                      ...permission,
                      action: event.target.value,
                    }),
                  })
                }
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
              <Input
                aria-label={t("SKILL_FIELD_EGRESS_DESTINATION")}
                onChange={(event) =>
                  onChange({
                    ...values,
                    dataEgress: replaceAt(values.dataEgress, index, {
                      ...egress,
                      destination: event.target.value,
                    }),
                  })
                }
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
            <Input
              aria-label={t("SKILL_FIELD_DATA_CLASSES")}
              onChange={(event) =>
                onChange({
                  ...values,
                  dataEgress: replaceAt(values.dataEgress, index, {
                    ...egress,
                    dataClasses: event.target.value.split(","),
                  }),
                })
              }
              placeholder={t("SKILL_FIELD_DATA_CLASSES_PLACEHOLDER")}
              value={egress.dataClasses.join(",")}
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
                  <SelectItem value="text/markdown">Markdown</SelectItem>
                  <SelectItem value="text/plain">Plain text</SelectItem>
                  <SelectItem value="application/json">JSON</SelectItem>
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

function replaceAt<T>(values: readonly T[], index: number, value: T): T[] {
  return values.map((item, itemIndex) => (itemIndex === index ? value : item));
}

function removeAt<T>(values: readonly T[], index: number): T[] {
  return values.filter((_, itemIndex) => itemIndex !== index);
}
