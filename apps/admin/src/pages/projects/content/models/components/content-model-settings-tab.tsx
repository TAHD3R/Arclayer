import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import type {
  AdminContentModel,
  PatchAdminContentModelPayload,
} from "@arclayer/openapi/admin-types";
import { getContentModelImpactPreview, patchContentModel } from "@/api/content";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { Checkbox } from "@arclayer/ui/checkbox";
import { Input } from "@arclayer/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { Switch } from "@arclayer/ui/switch";
import {
  SystemSettingField,
  SystemSettingFooterActions,
  SystemSettingItem,
  SystemSettingRow,
  SystemSettingStack,
} from "@/pages/system/components/system-setting-item";

export type ContentModelSettingsSectionKey = "settings" | "workflow";

type ContentModelSettingsTabProps = {
  projectId: string;
  model: AdminContentModel;
  canManageModels: boolean;
  pending: boolean;
  section: ContentModelSettingsSectionKey;
  onModelChange: (model: AdminContentModel) => void;
};

const CAPABILITIES = [
  "versioned",
  "routable",
  "treeable",
  "visual_editable",
  "rich_text_editable",
  "queryable",
  "has_slots",
  "has_relations",
  "localizable",
  "publishable",
  "schedulable",
  "seo_managed",
] as const;

type WorkflowContract = NonNullable<PatchAdminContentModelPayload["workflow"]>;
type WorkflowStage = NonNullable<WorkflowContract["stages"]>[number];
type WorkflowTransition = NonNullable<WorkflowContract["transitions"]>[number];
type WorkflowActorRule = NonNullable<WorkflowContract["stageAssignments"]>[number];
type WorkflowRoleCode = NonNullable<WorkflowActorRule["roleCodes"]>[number];
type WorkflowRoleState = Record<WorkflowStage, WorkflowRoleCode[]>;

type WorkflowSettingsState = {
  states: string[];
  initialState?: string;
  stages: WorkflowStage[];
  initialStage: WorkflowStage;
  publishStage: WorkflowStage;
  transitionKeys: string[];
  assignmentRoles: WorkflowRoleState;
  assignmentUserIds: Record<WorkflowStage, string[]>;
  permissionRoles: WorkflowRoleState;
  permissionUserIds: Record<WorkflowStage, string[]>;
};

const WORKFLOW_STAGES: readonly WorkflowStage[] = [
  "drafting",
  "in_review",
  "changes_requested",
  "approved",
];

const WORKFLOW_ROLE_CODES: readonly WorkflowRoleCode[] = ["owner", "editor", "viewer"];

const DEFAULT_WORKFLOW_TRANSITIONS: readonly WorkflowTransition[] = [
  { fromStage: "drafting", toStage: "in_review" },
  { fromStage: "drafting", toStage: "approved" },
  { fromStage: "in_review", toStage: "changes_requested" },
  { fromStage: "in_review", toStage: "approved" },
  { fromStage: "changes_requested", toStage: "drafting" },
  { fromStage: "changes_requested", toStage: "in_review" },
  { fromStage: "approved", toStage: "changes_requested" },
  { fromStage: "approved", toStage: "drafting" },
];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function isWorkflowStage(value: unknown): value is WorkflowStage {
  return WORKFLOW_STAGES.includes(value as WorkflowStage);
}

function isWorkflowRoleCode(value: unknown): value is WorkflowRoleCode {
  return WORKFLOW_ROLE_CODES.includes(value as WorkflowRoleCode);
}

function transitionKey(transition: Pick<WorkflowTransition, "fromStage" | "toStage">): string {
  return `${transition.fromStage}:${transition.toStage}`;
}

function createEmptyRoleState(): WorkflowRoleState {
  return {
    drafting: [],
    in_review: [],
    changes_requested: [],
    approved: [],
  };
}

function createEmptyUserIdState(): Record<WorkflowStage, string[]> {
  return {
    drafting: [],
    in_review: [],
    changes_requested: [],
    approved: [],
  };
}

function readRoutingSchema(model: AdminContentModel) {
  const routingSchema = model.routingSchema as Record<string, unknown> | null;
  const mode =
    routingSchema?.mode === "single" || routingSchema?.mode === "localized"
      ? routingSchema.mode
      : "none";
  const slugField =
    (routingSchema?.slugField as string | undefined) ??
    (routingSchema?.slug_field as string | undefined) ??
    "";
  return { mode, slugField };
}

function readWorkflowActorRules(value: unknown): {
  roleState: WorkflowRoleState;
  userIdState: Record<WorkflowStage, string[]>;
} {
  const roleState = createEmptyRoleState();
  const userIdState = createEmptyUserIdState();
  for (const item of asArray(value)) {
    const record = asRecord(item);
    const stage = record?.stage;
    if (!isWorkflowStage(stage)) continue;
    roleState[stage] = asArray(record?.roleCodes ?? record?.role_codes).filter(isWorkflowRoleCode);
    userIdState[stage] = asArray(record?.userIds ?? record?.user_ids)
      .filter((userId): userId is string => typeof userId === "string" && userId.trim().length > 0)
      .map((userId) => userId.trim());
  }
  return { roleState, userIdState };
}

function readWorkflowSettings(model: AdminContentModel): WorkflowSettingsState {
  const workflowPolicy = asRecord(model.workflowPolicy) ?? {};
  const initialStageCandidate = workflowPolicy.initialStage ?? workflowPolicy.initial_stage;
  const publishStageCandidate = workflowPolicy.publishStage ?? workflowPolicy.publish_stage;
  const configuredStages = asArray(workflowPolicy.stages).filter(isWorkflowStage);
  const stages = configuredStages.length ? configuredStages : [...WORKFLOW_STAGES];
  const transitions = asArray(workflowPolicy.transitions).flatMap((item) => {
    const record = asRecord(item);
    const fromStage = record?.fromStage ?? record?.from_stage;
    const toStage = record?.toStage ?? record?.to_stage;
    return isWorkflowStage(fromStage) && isWorkflowStage(toStage) ? [{ fromStage, toStage }] : [];
  });
  const assignments = readWorkflowActorRules(
    workflowPolicy.stageAssignments ?? workflowPolicy.stage_assignments,
  );
  const permissions = readWorkflowActorRules(
    workflowPolicy.stagePermissions ?? workflowPolicy.stage_permissions,
  );

  return {
    states: asArray(workflowPolicy.states).filter(
      (value): value is string => typeof value === "string" && value.trim().length > 0,
    ),
    initialState: asString(workflowPolicy.initialState ?? workflowPolicy.initial_state),
    stages,
    initialStage: isWorkflowStage(initialStageCandidate) ? initialStageCandidate : "drafting",
    publishStage: isWorkflowStage(publishStageCandidate) ? publishStageCandidate : "approved",
    transitionKeys: (transitions.length ? transitions : DEFAULT_WORKFLOW_TRANSITIONS).map(
      transitionKey,
    ),
    assignmentRoles: assignments.roleState,
    assignmentUserIds: assignments.userIdState,
    permissionRoles: permissions.roleState,
    permissionUserIds: permissions.userIdState,
  };
}

function buildWorkflowActorRules(
  roleState: WorkflowRoleState,
  userIdState: Record<WorkflowStage, string[]>,
): WorkflowActorRule[] {
  return WORKFLOW_STAGES.flatMap((stage) => {
    const roleCodes = roleState[stage];
    const userIds = userIdState[stage];
    return roleCodes.length || userIds.length ? [{ stage, roleCodes, userIds }] : [];
  });
}

function buildWorkflowContract(state: WorkflowSettingsState): WorkflowContract {
  return {
    states: state.states,
    ...(state.initialState ? { initialState: state.initialState } : {}),
    stages: state.stages,
    initialStage: state.initialStage,
    publishStage: state.publishStage,
    transitions: DEFAULT_WORKFLOW_TRANSITIONS.filter((transition) =>
      state.transitionKeys.includes(transitionKey(transition)),
    ),
    stageAssignments: buildWorkflowActorRules(state.assignmentRoles, state.assignmentUserIds),
    stagePermissions: buildWorkflowActorRules(state.permissionRoles, state.permissionUserIds),
  };
}

function toggleWorkflowRole(
  current: WorkflowRoleState,
  stage: WorkflowStage,
  role: WorkflowRoleCode,
  checked: boolean,
): WorkflowRoleState {
  const nextRoles = checked
    ? Array.from(new Set([...current[stage], role]))
    : current[stage].filter((value) => value !== role);
  return { ...current, [stage]: nextRoles };
}

function toComparable(value: unknown): string {
  return JSON.stringify(value);
}

function SettingCheckboxRow(props: {
  checked: boolean;
  disabled: boolean;
  label: string;
  description?: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <SystemSettingRow
      title={props.label}
      description={props.description}
      control={
        <Switch
          checked={props.checked}
          disabled={props.disabled}
          onCheckedChange={props.onChange}
        />
      }
    />
  );
}

export function ContentModelSettingsTab(props: ContentModelSettingsTabProps) {
  const { t } = useTranslation("content");

  const [capabilities, setCapabilities] = React.useState<string[]>(
    () => props.model.capabilities ?? [],
  );
  const [routingMode, setRoutingMode] = React.useState<string>(
    () => readRoutingSchema(props.model).mode,
  );
  const [slugField, setSlugField] = React.useState<string>(
    () => readRoutingSchema(props.model).slugField,
  );
  const [workflowSettings, setWorkflowSettings] = React.useState<WorkflowSettingsState>(() =>
    readWorkflowSettings(props.model),
  );

  React.useEffect(() => {
    const routingSchema = readRoutingSchema(props.model);
    setCapabilities(props.model.capabilities ?? []);
    setRoutingMode(routingSchema.mode);
    setSlugField(routingSchema.slugField);
    setWorkflowSettings(readWorkflowSettings(props.model));
  }, [props.model]);

  const canEdit = props.canManageModels && !props.pending;

  const coreDirty = React.useMemo(() => {
    const current = [...(props.model.capabilities ?? [])].sort();
    const next = [...capabilities].sort();
    return toComparable(current) !== toComparable(next);
  }, [capabilities, props.model.capabilities]);

  const routingDirty = React.useMemo(() => {
    const current = readRoutingSchema(props.model);
    return (
      toComparable({ mode: current.mode, slugField: current.slugField || null }) !==
      toComparable({ mode: routingMode, slugField: slugField.trim() || null })
    );
  }, [props.model, routingMode, slugField]);

  const workflowDirty = React.useMemo(() => {
    const current = buildWorkflowContract(readWorkflowSettings(props.model));
    const next = buildWorkflowContract(workflowSettings);
    return toComparable(current) !== toComparable(next);
  }, [props.model, workflowSettings]);

  const saveMutation = useMutation({
    mutationFn: async (
      payload: Pick<PatchAdminContentModelPayload, "capabilities" | "routing" | "workflow">,
    ) => {
      const preview = await getContentModelImpactPreview(props.projectId, props.model.id, payload);
      return patchContentModel(props.projectId, props.model.id, {
        ...payload,
        impactPreviewToken: preview.previewToken,
      });
    },
    onSuccess: (updated) => {
      props.onModelChange(updated);
      notifySuccessText(t("CONTENT_MODELS_SETTINGS_SAVED"));
    },
    onError: notifyError,
  });

  const handleToggleCapability = React.useCallback((capability: string, checked: boolean) => {
    setCapabilities((prev) =>
      checked ? Array.from(new Set([...prev, capability])) : prev.filter((c) => c !== capability),
    );
  }, []);

  const handleToggleTransition = React.useCallback((key: string, checked: boolean) => {
    setWorkflowSettings((current) => ({
      ...current,
      transitionKeys: checked
        ? Array.from(new Set([...current.transitionKeys, key]))
        : current.transitionKeys.filter((value) => value !== key),
    }));
  }, []);

  const handleWorkflowRoleChange = React.useCallback(
    (
      scope: "assignmentRoles" | "permissionRoles",
      stage: WorkflowStage,
      role: WorkflowRoleCode,
      checked: boolean,
    ) => {
      setWorkflowSettings((current) => ({
        ...current,
        [scope]: toggleWorkflowRole(current[scope], stage, role, checked),
      }));
    },
    [],
  );

  const saveSettings = React.useCallback(() => {
    void saveMutation.mutateAsync({
      capabilities: capabilities as PatchAdminContentModelPayload["capabilities"],
      routing: {
        mode: routingMode as "none" | "single" | "localized",
        slugField: slugField.trim() || null,
      },
    });
  }, [capabilities, routingMode, saveMutation, slugField]);

  const saveWorkflow = React.useCallback(() => {
    void saveMutation.mutateAsync({
      workflow: buildWorkflowContract(workflowSettings),
    });
  }, [saveMutation, workflowSettings]);

  const resetSettings = React.useCallback(() => {
    const routingSchema = readRoutingSchema(props.model);
    setCapabilities(props.model.capabilities ?? []);
    setRoutingMode(routingSchema.mode);
    setSlugField(routingSchema.slugField);
  }, [props.model]);

  const resetWorkflow = React.useCallback(() => {
    setWorkflowSettings(readWorkflowSettings(props.model));
  }, [props.model]);

  if (props.section === "settings") {
    return (
      <section className="min-h-0 pb-8">
        <div className="mx-auto w-full max-w-4xl py-6">
          <SystemSettingStack>
            <SystemSettingItem
              id="content-model-settings-capabilities"
              title={t("CONTENT_MODELS_SETTINGS_CAPABILITIES_TITLE")}
              description={t("CONTENT_MODELS_SETTINGS_CAPABILITIES_DESC")}
              footer={
                <SystemSettingFooterActions
                  dirty={coreDirty || routingDirty}
                  pending={saveMutation.isPending || !canEdit}
                  saveLabel={t("CONTENT_MODELS_SETTINGS_SAVE_ACTION")}
                  resetLabel={t("CONTENT_MODELS_FILTER_RESET")}
                  hint={t("CONTENT_MODELS_SETTINGS_UNSAVED_CHANGES")}
                  onSave={saveSettings}
                  onReset={resetSettings}
                />
              }
            >
              <div className="grid gap-1">
                {CAPABILITIES.map((capability) => (
                  <SettingCheckboxRow
                    key={capability}
                    checked={capabilities.includes(capability)}
                    disabled={!canEdit}
                    label={t(
                      `CONTENT_MODELS_SETTINGS_CAPABILITY_${capability.toUpperCase()}_LABEL`,
                    )}
                    description={t(
                      `CONTENT_MODELS_SETTINGS_CAPABILITY_${capability.toUpperCase()}_DESC`,
                    )}
                    onChange={(checked) => handleToggleCapability(capability, checked)}
                  />
                ))}
              </div>
            </SystemSettingItem>

            <SystemSettingItem
              id="content-model-settings-routing"
              title={t("CONTENT_MODELS_SETTINGS_ROUTING_TITLE")}
              description={t("CONTENT_MODELS_SETTINGS_ROUTING_DESC")}
            >
              <div className="grid gap-3">
                <SystemSettingRow
                  title={t("CONTENT_MODELS_SETTINGS_ROUTING_MODE_LABEL")}
                  description={t("CONTENT_MODELS_SETTINGS_ROUTING_MODE_DESC")}
                  control={
                    <Select value={routingMode} onValueChange={(value) => setRoutingMode(value)}>
                      <SelectTrigger className="w-52" disabled={!canEdit}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="popper" align="start">
                        <SelectItem value="none">
                          {t("CONTENT_MODELS_SETTINGS_ROUTING_MODE_NONE")}
                        </SelectItem>
                        <SelectItem value="single">
                          {t("CONTENT_MODELS_SETTINGS_ROUTING_MODE_SINGLE")}
                        </SelectItem>
                        <SelectItem value="localized">
                          {t("CONTENT_MODELS_SETTINGS_ROUTING_MODE_LOCALIZED")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  }
                />

                {routingMode !== "none" ? (
                  <SystemSettingField
                    label={t("CONTENT_MODELS_SETTINGS_ROUTING_SLUG_FIELD_LABEL")}
                    description={t("CONTENT_MODELS_SETTINGS_ROUTING_SLUG_FIELD_DESC")}
                  >
                    <Input
                      aria-label={t("CONTENT_MODELS_SETTINGS_ROUTING_SLUG_FIELD_LABEL")}
                      value={slugField}
                      disabled={!canEdit}
                      placeholder="slug"
                      onChange={(event) => setSlugField(event.target.value)}
                    />
                  </SystemSettingField>
                ) : null}
              </div>
            </SystemSettingItem>
          </SystemSettingStack>
        </div>
      </section>
    );
  }

  return (
    <section className="min-h-0 pb-8">
      <div className="mx-auto w-full max-w-4xl py-6">
        <SystemSettingStack>
          <SystemSettingItem
            id="content-model-settings-workflow"
            title={t("CONTENT_MODELS_SETTINGS_WORKFLOW_TITLE")}
            description={t("CONTENT_MODELS_SETTINGS_WORKFLOW_DESC")}
            footer={
              <SystemSettingFooterActions
                dirty={workflowDirty}
                pending={saveMutation.isPending || !canEdit}
                saveLabel={t("CONTENT_MODELS_SETTINGS_SAVE_ACTION")}
                resetLabel={t("CONTENT_MODELS_FILTER_RESET")}
                hint={t("CONTENT_MODELS_SETTINGS_UNSAVED_CHANGES")}
                onSave={saveWorkflow}
                onReset={resetWorkflow}
              />
            }
          >
            <div className="grid gap-5">
              <SystemSettingRow
                title={t("CONTENT_MODELS_SETTINGS_WORKFLOW_PUBLISH_STAGE_LABEL")}
                control={
                  <Select
                    value={workflowSettings.publishStage}
                    onValueChange={(value) =>
                      setWorkflowSettings((current) => ({
                        ...current,
                        publishStage: value as WorkflowStage,
                      }))
                    }
                  >
                    <SelectTrigger className="w-52" disabled={!canEdit}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper" align="start">
                      {WORKFLOW_STAGES.map((stage) => (
                        <SelectItem key={stage} value={stage}>
                          {t(`CONTENT_MODELS_WORKFLOW_STAGE_${stage.toUpperCase()}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                }
              />

              <div className="grid gap-2">
                <div className="text-headline font-semibold text-label-primary">
                  {t("CONTENT_MODELS_SETTINGS_WORKFLOW_TRANSITIONS_LABEL")}
                </div>
                <div className="text-callout text-label-secondary">
                  {t("CONTENT_MODELS_SETTINGS_WORKFLOW_TRANSITIONS_DESC")}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {DEFAULT_WORKFLOW_TRANSITIONS.map((transition) => {
                    const key = transitionKey(transition);
                    return (
                      <label
                        key={key}
                        className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2 text-callout text-label-primary"
                      >
                        <Checkbox
                          checked={workflowSettings.transitionKeys.includes(key)}
                          disabled={!canEdit}
                          onCheckedChange={(checked) =>
                            handleToggleTransition(key, Boolean(checked))
                          }
                        />
                        <span>
                          {t(`CONTENT_MODELS_WORKFLOW_STAGE_${transition.fromStage.toUpperCase()}`)}
                          {" -> "}
                          {t(`CONTENT_MODELS_WORKFLOW_STAGE_${transition.toStage.toUpperCase()}`)}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {["assignmentRoles", "permissionRoles"].map((scope) => {
                const isAssignment = scope === "assignmentRoles";
                return (
                  <div key={scope} className="grid gap-3">
                    <div className="text-headline font-semibold text-label-primary">
                      {t(
                        isAssignment
                          ? "CONTENT_MODELS_SETTINGS_WORKFLOW_ASSIGNMENTS_LABEL"
                          : "CONTENT_MODELS_SETTINGS_WORKFLOW_PERMISSIONS_LABEL",
                      )}
                    </div>
                    <div className="text-callout text-label-secondary">
                      {t(
                        isAssignment
                          ? "CONTENT_MODELS_SETTINGS_WORKFLOW_ASSIGNMENTS_DESC"
                          : "CONTENT_MODELS_SETTINGS_WORKFLOW_PERMISSIONS_DESC",
                      )}
                    </div>
                    <div className="grid gap-2">
                      {WORKFLOW_STAGES.map((stage) => (
                        <div
                          key={`${scope}-${stage}`}
                          className="grid gap-2 rounded-md border border-border/60 px-3 py-3"
                        >
                          <div className="text-headline text-label-primary">
                            {t(`CONTENT_MODELS_WORKFLOW_STAGE_${stage.toUpperCase()}`)}
                          </div>
                          <div className="flex flex-wrap gap-4">
                            {WORKFLOW_ROLE_CODES.map((role) => (
                              <label key={role} className="flex items-center gap-2 text-callout">
                                <Checkbox
                                  checked={workflowSettings[
                                    scope as "assignmentRoles" | "permissionRoles"
                                  ][stage].includes(role)}
                                  disabled={!canEdit}
                                  onCheckedChange={(checked) =>
                                    handleWorkflowRoleChange(
                                      scope as "assignmentRoles" | "permissionRoles",
                                      stage,
                                      role,
                                      Boolean(checked),
                                    )
                                  }
                                />
                                {t(`CONTENT_MODELS_WORKFLOW_ROLE_${role.toUpperCase()}`)}
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </SystemSettingItem>
        </SystemSettingStack>
      </div>
    </section>
  );
}
