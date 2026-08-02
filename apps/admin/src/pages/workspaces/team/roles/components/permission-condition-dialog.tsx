import * as React from "react";
import { Plus, Trash2 } from "lucide-react";

import type {
  WorkspacePermissionOut as Permission,
  PermissionCondition,
  PermissionConditionOperator,
  PermissionConditionSetInput as PermissionConditionSet,
  WorkspaceRoleOut as Role,
  WorkspacePermissionConditionTemplateOut as WorkspacePermissionConditionTemplate,
} from "@arclayer/openapi";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { SettingDialog } from "@arclayer/ui/setting-dialog";

type Translate = (key: string, options?: Record<string, unknown>) => string;

const STATIC_OPERATORS = new Set<PermissionConditionOperator>(["equals", "in"]);

export function PermissionConditionDialog(props: {
  t: Translate;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: Role | null;
  permission: Permission | null;
  templates: WorkspacePermissionConditionTemplate[];
  conditionSets: PermissionConditionSet[];
  onSave: (conditionSets: PermissionConditionSet[]) => void;
}) {
  const [draft, setDraft] = React.useState<PermissionConditionSet[]>([]);
  const availableTemplates = React.useMemo(() => {
    const keys = new Set(props.permission?.conditionTemplates ?? []);
    return props.templates.filter((template) => keys.has(template.key));
  }, [props.permission?.conditionTemplates, props.templates]);

  React.useEffect(() => {
    if (!props.open) return;
    setDraft(structuredClone(props.conditionSets));
  }, [props.conditionSets, props.open]);

  const addConditionSet = () => {
    const template = availableTemplates[0];
    if (!template) return;
    setDraft((current) => [...current, { conditions: [conditionFromTemplate(template)] }]);
  };

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={props.t("team:TEAM_ROLES_CONDITION_DIALOG_TITLE", {
        roleName: props.role?.name ?? "",
      })}
      description={props.t("team:TEAM_ROLES_CONDITION_DIALOG_DESC", {
        permissionName: props.permission?.name ?? "",
      })}
      footer={
        <>
          <Button variant="ghost" onClick={() => props.onOpenChange(false)}>
            {props.t("common:CANCEL")}
          </Button>
          <Button
            onClick={() => {
              props.onSave(normalizeConditionSets(draft));
              props.onOpenChange(false);
            }}
          >
            {props.t("common:CONFIRM")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {draft.length ? (
          draft.map((conditionSet, setIndex) => (
            <div key={setIndex} className="rounded-xl border border-border/70 p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-callout font-semibold text-label-primary">
                    {props.t("team:TEAM_ROLES_CONDITION_GROUP", { index: setIndex + 1 })}
                  </div>
                  <div className="text-caption text-label-secondary">
                    {props.t("team:TEAM_ROLES_CONDITION_GROUP_HELP")}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={props.t("team:TEAM_ROLES_CONDITION_REMOVE_GROUP")}
                  onClick={() =>
                    setDraft((current) => current.filter((_, index) => index !== setIndex))
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <div className="space-y-2">
                {(conditionSet.conditions ?? []).map((condition, conditionIndex) => (
                  <ConditionEditor
                    key={conditionIndex}
                    t={props.t}
                    condition={condition}
                    templates={availableTemplates}
                    onChange={(next) =>
                      setDraft((current) =>
                        current.map((item, index) =>
                          index === setIndex
                            ? {
                                conditions: (item.conditions ?? []).map((value, valueIndex) =>
                                  valueIndex === conditionIndex ? next : value,
                                ),
                              }
                            : item,
                        ),
                      )
                    }
                    onRemove={() =>
                      setDraft((current) =>
                        current
                          .map((item, index) =>
                            index === setIndex
                              ? {
                                  conditions: (item.conditions ?? []).filter(
                                    (_, valueIndex) => valueIndex !== conditionIndex,
                                  ),
                                }
                              : item,
                          )
                          .filter((item) => (item.conditions ?? []).length > 0),
                      )
                    }
                  />
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center">
            <div className="text-callout font-semibold text-label-primary">
              {props.t("team:TEAM_ROLES_CONDITION_EMPTY_TITLE")}
            </div>
            <div className="mt-1 text-footnote text-label-secondary">
              {props.t("team:TEAM_ROLES_CONDITION_EMPTY_DESC")}
            </div>
          </div>
        )}
        <Button
          variant="outline"
          className="w-full"
          disabled={!availableTemplates.length}
          onClick={addConditionSet}
        >
          <Plus className="size-4" />
          {props.t("team:TEAM_ROLES_CONDITION_ADD_GROUP")}
        </Button>
      </div>
    </SettingDialog>
  );
}

function ConditionEditor(props: {
  t: Translate;
  condition: PermissionCondition;
  templates: WorkspacePermissionConditionTemplate[];
  onChange: (condition: PermissionCondition) => void;
  onRemove: () => void;
}) {
  const template = props.templates.find((item) => item.field === props.condition.field);
  const operator = props.condition.operator;
  return (
    <div className="grid gap-2 rounded-lg bg-muted/35 p-2 sm:grid-cols-[1fr_1fr_1.2fr_auto]">
      <Select
        value={template?.key ?? ""}
        onValueChange={(key) => {
          const next = props.templates.find((item) => item.key === key);
          if (next) props.onChange(conditionFromTemplate(next));
        }}
      >
        <SelectTrigger aria-label={props.t("team:TEAM_ROLES_CONDITION_FIELD")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" align="start">
          {props.templates.map((item) => (
            <SelectItem key={item.key} value={item.key}>
              {item.description}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={operator}
        onValueChange={(value) =>
          props.onChange({
            ...props.condition,
            operator: value as PermissionConditionOperator,
            value: STATIC_OPERATORS.has(value as PermissionConditionOperator) ? "" : null,
          })
        }
      >
        <SelectTrigger aria-label={props.t("team:TEAM_ROLES_CONDITION_OPERATOR")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" align="start">
          {(template?.operators ?? []).map((value) => (
            <SelectItem key={value} value={value}>
              {props.t(`team:TEAM_ROLES_CONDITION_OPERATOR_${value.toUpperCase()}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {STATIC_OPERATORS.has(operator) ? (
        <Input
          aria-label={props.t("team:TEAM_ROLES_CONDITION_VALUE")}
          value={formatConditionValue(props.condition.value)}
          placeholder={props.t("team:TEAM_ROLES_CONDITION_VALUE_PLACEHOLDER")}
          onChange={(event) =>
            props.onChange({
              ...props.condition,
              value:
                operator === "in"
                  ? event.target.value
                      .split(",")
                      .map((value) => value.trim())
                      .filter(Boolean)
                  : event.target.value,
            })
          }
        />
      ) : (
        <div className="flex min-h-9 items-center px-2 text-footnote text-label-secondary">
          {props.t("team:TEAM_ROLES_CONDITION_CONTEXT_VALUE")}
        </div>
      )}
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={props.t("team:TEAM_ROLES_CONDITION_REMOVE")}
        onClick={props.onRemove}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

function conditionFromTemplate(
  template: WorkspacePermissionConditionTemplate,
): PermissionCondition {
  const operator = template.operators[0] ?? "equals";
  return {
    field: template.field,
    operator,
    value: STATIC_OPERATORS.has(operator) ? "" : null,
  };
}

function normalizeConditionSets(conditionSets: PermissionConditionSet[]): PermissionConditionSet[] {
  return conditionSets
    .map((conditionSet) => ({ conditions: conditionSet.conditions ?? [] }))
    .filter((conditionSet) => conditionSet.conditions.length > 0);
}

function formatConditionValue(value: PermissionCondition["value"]): string {
  if (Array.isArray(value)) return value.join(", ");
  return value === null || value === undefined ? "" : String(value);
}
