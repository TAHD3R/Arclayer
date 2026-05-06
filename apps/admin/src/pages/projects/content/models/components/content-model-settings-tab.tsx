import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { ListChecks, Route, Settings2, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import type {
  AdminContentModel,
  PatchAdminContentModelPayload,
} from "@arclayer/openapi/admin-types";
import { getContentModelImpactPreview, patchContentModel } from "@/api/content";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { Button } from "@arclayer/ui/button";
import { Checkbox } from "@arclayer/ui/checkbox";
import { Input } from "@arclayer/ui/input";
import { SettingDialogField, SettingDialogFields } from "@arclayer/ui/setting-dialog-field";
import { cn } from "@arclayer/lib/utils";
import { ChromeTabsContent } from "@arclayer/ui/chrome-tabs";

type ContentModelSettingsTabProps = {
  projectId: string;
  model: AdminContentModel;
  canManageModels: boolean;
  pending: boolean;
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
type WorkflowTextState = Record<WorkflowStage, string>;

type WorkflowSettingsState = {
  states: string[];
  initialState?: string;
  stages: WorkflowStage[];
  initialStage: WorkflowStage;
  publishStage: WorkflowStage;
  transitionKeys: string[];
  assignmentRoles: WorkflowRoleState;
  assignmentUserIds: WorkflowTextState;
  permissionRoles: WorkflowRoleState;
  permissionUserIds: WorkflowTextState;
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

function createEmptyTextState(): WorkflowTextState {
  return Object.fromEntries(WORKFLOW_STAGES.map((stage) => [stage, ""])) as WorkflowTextState;
}

function readWorkflowActorRules(value: unknown): {
  roleState: WorkflowRoleState;
  userState: WorkflowTextState;
} {
  const roleState = createEmptyRoleState();
  const userState = createEmptyTextState();
  for (const item of asArray(value)) {
    const record = asRecord(item);
    const stage = record?.stage;
    if (!isWorkflowStage(stage)) continue;
    roleState[stage] = asArray(record?.roleCodes ?? record?.role_codes).filter(isWorkflowRoleCode);
    userState[stage] = asArray(record?.userIds ?? record?.user_ids)
      .filter((userId): userId is string => typeof userId === "string" && userId.trim().length > 0)
      .map((userId) => userId.trim())
      .join(", ");
  }
  return { roleState, userState };
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
    assignmentUserIds: assignments.userState,
    permissionRoles: permissions.roleState,
    permissionUserIds: permissions.userState,
  };
}

function parseWorkflowUserIds(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[\s,]+/g)
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  );
}

function buildWorkflowActorRules(
  roleState: WorkflowRoleState,
  userState: WorkflowTextState,
): WorkflowActorRule[] {
  return WORKFLOW_STAGES.flatMap((stage) => {
    const roleCodes = roleState[stage];
    const userIds = parseWorkflowUserIds(userState[stage]);
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

function CapabilityCheckbox(props: {
  capability: string;
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 rounded-md border border-border/70 bg-background px-3 py-3">
      <Checkbox
        checked={props.checked}
        disabled={props.disabled}
        onCheckedChange={(checked) => props.onChange(Boolean(checked))}
      />
      <div className="min-w-0">
        <div className="text-headline text-label-primary">{props.label}</div>
        <div className="mt-1 text-callout text-label-secondary">{props.description}</div>
      </div>
    </label>
  );
}

function WorkflowStageButton(props: {
  active: boolean;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      className={cn(
        "flex items-center justify-center rounded-md border px-3 py-2 text-footnote font-medium transition-colors",
        props.active
          ? "border-primary bg-primary/8 text-label-primary"
          : "border-border/70 bg-background text-label-secondary hover:bg-accent/40 hover:text-label-primary",
        props.disabled && "cursor-not-allowed opacity-60",
      )}
      onClick={props.onClick}
    >
      {props.label}
    </button>
  );
}

function WorkflowActorRulesEditor(props: {
  title: string;
  description: string;
  disabled: boolean;
  roles: WorkflowRoleState;
  userIds: WorkflowTextState;
  onRolesChange: (stage: WorkflowStage, role: WorkflowRoleCode, checked: boolean) => void;
  onUserIdsChange: (stage: WorkflowStage, value: string) => void;
  t: (key: string) => string;
}) {
  return (
    <SettingDialogField title={props.title} description={props.description}>
      <div className="grid gap-3">
        {WORKFLOW_STAGES.map((stage) => (
          <div
            key={stage}
            className="grid gap-3 rounded-md border border-border/70 bg-background px-3 py-3"
          >
            <div className="text-headline text-label-primary">
              {props.t(`CONTENT_MODELS_WORKFLOW_STAGE_${stage.toUpperCase()}`)}
            </div>
            <div className="flex flex-wrap gap-3">
              {WORKFLOW_ROLE_CODES.map((role) => (
                <label
                  key={role}
                  className="flex items-center gap-2 text-callout text-label-primary"
                >
                  <Checkbox
                    checked={props.roles[stage].includes(role)}
                    disabled={props.disabled}
                    onCheckedChange={(checked) =>
                      props.onRolesChange(stage, role, Boolean(checked))
                    }
                  />
                  {props.t(`CONTENT_MODELS_WORKFLOW_ROLE_${role.toUpperCase()}`)}
                </label>
              ))}
            </div>
            <Input
              aria-label={props.t("CONTENT_MODELS_SETTINGS_WORKFLOW_USER_IDS_LABEL")}
              value={props.userIds[stage]}
              disabled={props.disabled}
              placeholder={props.t("CONTENT_MODELS_SETTINGS_WORKFLOW_USER_IDS_PLACEHOLDER")}
              onChange={(event) => props.onUserIdsChange(stage, event.target.value)}
            />
          </div>
        ))}
      </div>
    </SettingDialogField>
  );
}

function SettingsSection(props: {
  icon: LucideIcon;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const Icon = props.icon;
  return (
    <section className="grid gap-4">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 size-4.5 shrink-0 text-label-secondary" />
        <div>
          <h3 className="text-headline text-label-primary">{props.title}</h3>
          {props.description ? (
            <p className="mt-1 text-callout text-label-secondary">{props.description}</p>
          ) : null}
        </div>
      </div>
      {props.children}
    </section>
  );
}

export function ContentModelSettingsTab(props: ContentModelSettingsTabProps) {
  const { t } = useTranslation("content");
  const model = props.model;

  const [capabilities, setCapabilities] = React.useState<string[]>(() => model.capabilities ?? []);
  const [routingMode, setRoutingMode] = React.useState<string>(() => readRoutingSchema(model).mode);
  const [slugField, setSlugField] = React.useState<string>(
    () => readRoutingSchema(model).slugField,
  );
  const [workflowSettings, setWorkflowSettings] = React.useState<WorkflowSettingsState>(() =>
    readWorkflowSettings(model),
  );

  React.useEffect(() => {
    const routingSchema = readRoutingSchema(model);
    setCapabilities(model.capabilities ?? []);
    setRoutingMode(routingSchema.mode);
    setSlugField(routingSchema.slugField);
    setWorkflowSettings(readWorkflowSettings(model));
  }, [model]);

  const hasChanges = React.useMemo(() => {
    const currentCaps = [...(model.capabilities ?? [])].sort().join(",");
    const nextCaps = [...capabilities].sort().join(",");
    const currentModelRouting = readRoutingSchema(model);
    const currentRouting = JSON.stringify({
      mode: currentModelRouting.mode,
      slugField: currentModelRouting.slugField || null,
    });
    const nextRouting = JSON.stringify({
      mode: routingMode,
      slugField: slugField || null,
    });
    const currentWorkflow = JSON.stringify(buildWorkflowContract(readWorkflowSettings(model)));
    const nextWorkflow = JSON.stringify(buildWorkflowContract(workflowSettings));
    return (
      currentCaps !== nextCaps || currentRouting !== nextRouting || currentWorkflow !== nextWorkflow
    );
  }, [model, capabilities, routingMode, slugField, workflowSettings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const patchPayload = {
        capabilities: capabilities as Parameters<typeof patchContentModel>[2]["capabilities"],
        routing: {
          mode: routingMode as "none" | "single" | "localized",
          slugField: slugField || null,
        },
        workflow: buildWorkflowContract(workflowSettings),
      };
      const preview = await getContentModelImpactPreview(
        props.projectId,
        props.model.id,
        patchPayload,
      );
      return patchContentModel(props.projectId, props.model.id, {
        ...patchPayload,
        impact_preview_token: preview.previewToken,
      } as Parameters<typeof patchContentModel>[2]);
    },
    onSuccess: (updated) => {
      props.onModelChange(updated);
      notifySuccessText(t("CONTENT_MODELS_SETTINGS_SAVED"));
    },
    onError: notifyError,
  });

  const handleToggleCapability = React.useCallback((capability: string, checked: boolean) => {
    setCapabilities((prev) =>
      checked ? [...prev, capability] : prev.filter((c) => c !== capability),
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

  const handleWorkflowUserIdsChange = React.useCallback(
    (scope: "assignmentUserIds" | "permissionUserIds", stage: WorkflowStage, value: string) => {
      setWorkflowSettings((current) => ({
        ...current,
        [scope]: { ...current[scope], [stage]: value },
      }));
    },
    [],
  );

  const canEdit = props.canManageModels && !props.pending;

  return (
    <ChromeTabsContent value="settings" className="min-h-0 flex-1 pb-8">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 py-6">
        <SettingsSection
          icon={Settings2}
          title={t("CONTENT_MODELS_SETTINGS_CAPABILITIES_TITLE")}
          description={t("CONTENT_MODELS_SETTINGS_CAPABILITIES_DESC")}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {CAPABILITIES.map((capability) => (
              <CapabilityCheckbox
                key={capability}
                capability={capability}
                label={t(`CONTENT_MODELS_SETTINGS_CAPABILITY_${capability.toUpperCase()}_LABEL`)}
                description={t(
                  `CONTENT_MODELS_SETTINGS_CAPABILITY_${capability.toUpperCase()}_DESC`,
                )}
                checked={capabilities.includes(capability)}
                disabled={!canEdit}
                onChange={(checked) => handleToggleCapability(capability, checked)}
              />
            ))}
          </div>
        </SettingsSection>

        <SettingsSection
          icon={ListChecks}
          title={t("CONTENT_MODELS_SETTINGS_WORKFLOW_TITLE")}
          description={t("CONTENT_MODELS_SETTINGS_WORKFLOW_DESC")}
        >
          <SettingDialogFields>
            <SettingDialogField title={t("CONTENT_MODELS_SETTINGS_WORKFLOW_PUBLISH_STAGE_LABEL")}>
              <div className="grid gap-2 sm:grid-cols-4">
                {WORKFLOW_STAGES.map((stage) => (
                  <WorkflowStageButton
                    key={stage}
                    active={workflowSettings.publishStage === stage}
                    disabled={!canEdit}
                    label={t(`CONTENT_MODELS_WORKFLOW_STAGE_${stage.toUpperCase()}`)}
                    onClick={() =>
                      setWorkflowSettings((current) => ({ ...current, publishStage: stage }))
                    }
                  />
                ))}
              </div>
            </SettingDialogField>
            <SettingDialogField
              title={t("CONTENT_MODELS_SETTINGS_WORKFLOW_TRANSITIONS_LABEL")}
              description={t("CONTENT_MODELS_SETTINGS_WORKFLOW_TRANSITIONS_DESC")}
            >
              <div className="grid gap-2 sm:grid-cols-2">
                {DEFAULT_WORKFLOW_TRANSITIONS.map((transition) => {
                  const key = transitionKey(transition);
                  return (
                    <label
                      key={key}
                      className="flex items-center gap-2 rounded-md border border-border/70 bg-background px-3 py-2 text-callout text-label-primary"
                    >
                      <Checkbox
                        checked={workflowSettings.transitionKeys.includes(key)}
                        disabled={!canEdit}
                        onCheckedChange={(checked) => handleToggleTransition(key, Boolean(checked))}
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
            </SettingDialogField>
            <WorkflowActorRulesEditor
              title={t("CONTENT_MODELS_SETTINGS_WORKFLOW_ASSIGNMENTS_LABEL")}
              description={t("CONTENT_MODELS_SETTINGS_WORKFLOW_ASSIGNMENTS_DESC")}
              disabled={!canEdit}
              roles={workflowSettings.assignmentRoles}
              userIds={workflowSettings.assignmentUserIds}
              t={t}
              onRolesChange={(stage, role, checked) =>
                handleWorkflowRoleChange("assignmentRoles", stage, role, checked)
              }
              onUserIdsChange={(stage, value) =>
                handleWorkflowUserIdsChange("assignmentUserIds", stage, value)
              }
            />
            <WorkflowActorRulesEditor
              title={t("CONTENT_MODELS_SETTINGS_WORKFLOW_PERMISSIONS_LABEL")}
              description={t("CONTENT_MODELS_SETTINGS_WORKFLOW_PERMISSIONS_DESC")}
              disabled={!canEdit}
              roles={workflowSettings.permissionRoles}
              userIds={workflowSettings.permissionUserIds}
              t={t}
              onRolesChange={(stage, role, checked) =>
                handleWorkflowRoleChange("permissionRoles", stage, role, checked)
              }
              onUserIdsChange={(stage, value) =>
                handleWorkflowUserIdsChange("permissionUserIds", stage, value)
              }
            />
          </SettingDialogFields>
        </SettingsSection>

        <SettingsSection
          icon={Route}
          title={t("CONTENT_MODELS_SETTINGS_ROUTING_TITLE")}
          description={t("CONTENT_MODELS_SETTINGS_ROUTING_DESC")}
        >
          <SettingDialogFields>
            <SettingDialogField title={t("CONTENT_MODELS_SETTINGS_ROUTING_MODE_LABEL")}>
              <div className="grid gap-2 sm:grid-cols-3">
                {(["none", "single", "localized"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    disabled={!canEdit}
                    className={cn(
                      "flex items-center justify-center rounded-md border px-3 py-2 text-footnote font-medium transition-colors",
                      routingMode === mode
                        ? "border-primary bg-primary/8 text-label-primary"
                        : "border-border/70 bg-background text-label-secondary hover:bg-accent/40 hover:text-label-primary",
                      !canEdit && "cursor-not-allowed opacity-60",
                    )}
                    onClick={() => setRoutingMode(mode)}
                  >
                    {t(`CONTENT_MODELS_SETTINGS_ROUTING_MODE_${mode.toUpperCase()}`)}
                  </button>
                ))}
              </div>
            </SettingDialogField>
            {routingMode !== "none" ? (
              <SettingDialogField title={t("CONTENT_MODELS_SETTINGS_ROUTING_SLUG_FIELD_LABEL")}>
                <Input
                  aria-label={t("CONTENT_MODELS_SETTINGS_ROUTING_SLUG_FIELD_LABEL")}
                  value={slugField}
                  disabled={!canEdit}
                  placeholder="slug"
                  onChange={(e) => setSlugField(e.target.value)}
                />
              </SettingDialogField>
            ) : null}
          </SettingDialogFields>
        </SettingsSection>

        <div className="flex items-center justify-end gap-3 border-t border-border/60 pt-5">
          <Button
            variant="primary"
            loading={saveMutation.isPending}
            disabled={!canEdit || !hasChanges}
            onClick={() => saveMutation.mutate()}
          >
            {t("CONTENT_MODELS_SETTINGS_SAVE_ACTION")}
          </Button>
        </div>
      </div>
    </ChromeTabsContent>
  );
}
