import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { listSystemDirectoryProjects } from "@/api/system-directory";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@arclayer/ui/select";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { SettingDialogField, SettingDialogFields } from "@arclayer/ui/setting-dialog-field";
import { Switch } from "@arclayer/ui/switch";
import { Textarea } from "@arclayer/ui/textarea";
import type {
  AgentVersionCreateRequest,
  SystemAgentAssignmentCreateRequest,
  SystemAgentAssignmentOut,
  SystemAgentAssignmentUpdateRequest,
  SystemAgentCatalogCapabilitiesOut,
  SystemAgentDefinitionDetailOut,
  SystemAgentDefinitionSummaryOut,
  SystemAgentDefinitionUpdateRequest,
} from "@arclayer/openapi";
import type { SystemDirectoryWorkspace } from "@arclayer/openapi/admin-types";

import { AgentSkillGrantFields } from "./agent-skill-grant-fields";

type DefinitionCreateValues = {
  displayName: string;
  slug: string;
  role: string;
  description: string;
  avatarUrl: string;
  instructions: string;
};

const EMPTY_DEFINITION_VALUES: DefinitionCreateValues = {
  displayName: "",
  slug: "",
  role: "",
  description: "",
  avatarUrl: "",
  instructions: "",
};

function toSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function versionPayload(input: {
  instructions: string;
  modes: Array<"plan" | "build">;
  delegationDefinitionIds: string[];
  skillGrantWorkspaceId: string;
  skillInstallationIds: string[];
}): AgentVersionCreateRequest {
  return {
    instructions: input.instructions.trim(),
    modelPolicy: { routingPolicy: "workspace_default" },
    supportedExecutionModes: input.modes,
    toolGrants: ["human.request_input"],
    skillGrantWorkspaceId: input.skillInstallationIds.length ? input.skillGrantWorkspaceId : null,
    skillInstallationIds: input.skillInstallationIds,
    knowledgeBaseIds: [],
    delegationDefinitionIds: input.delegationDefinitionIds,
    approvalProfile: { profileId: "human-input-v1" },
    compatibility: { agentRuntimeProtocol: 1 },
  };
}

export function AgentDefinitionCreateDialog(props: {
  open: boolean;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: DefinitionCreateValues) => void;
}) {
  const { t } = useTranslation(["settings", "common"]);
  const [values, setValues] = useState(EMPTY_DEFINITION_VALUES);
  const [slugEdited, setSlugEdited] = useState(false);

  useEffect(() => {
    if (!props.open) return;
    setValues(EMPTY_DEFINITION_VALUES);
    setSlugEdited(false);
  }, [props.open]);

  const valid =
    values.displayName.trim() &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(values.slug) &&
    values.slug.length >= 2 &&
    values.role.trim() &&
    values.description.trim() &&
    values.instructions.trim();

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t("settings:SETTINGS_SYSTEM_AGENT_CREATE_TITLE")}
      description={t("settings:SETTINGS_SYSTEM_AGENT_CREATE_DESC")}
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>
            {t("common:CANCEL")}
          </Button>
          <Button
            type="button"
            disabled={props.pending || !valid}
            onClick={() => props.onSubmit(values)}
          >
            {t("settings:SETTINGS_SYSTEM_AGENT_CREATE_ACTION")}
          </Button>
        </>
      }
    >
      <SettingDialogFields>
        <SettingDialogField title={t("settings:SETTINGS_SYSTEM_AGENT_NAME_LABEL")}>
          <Input
            value={values.displayName}
            onChange={(event) => {
              const displayName = event.target.value;
              setValues((current) => ({
                ...current,
                displayName,
                slug: slugEdited ? current.slug : toSlug(displayName),
              }));
            }}
          />
        </SettingDialogField>
        <SettingDialogField
          title={t("settings:SETTINGS_SYSTEM_AGENT_SLUG_LABEL")}
          description={t("settings:SETTINGS_SYSTEM_AGENT_SLUG_DESC")}
        >
          <Input
            value={values.slug}
            className="font-mono"
            onChange={(event) => {
              setSlugEdited(true);
              setValues((current) => ({ ...current, slug: toSlug(event.target.value) }));
            }}
          />
        </SettingDialogField>
        <SettingDialogField title={t("settings:SETTINGS_SYSTEM_AGENT_ROLE_LABEL")}>
          <Input
            value={values.role}
            placeholder="content_research"
            onChange={(event) => setValues((current) => ({ ...current, role: event.target.value }))}
          />
        </SettingDialogField>
        <SettingDialogField title={t("settings:SETTINGS_SYSTEM_AGENT_DESCRIPTION_LABEL")}>
          <Textarea
            rows={3}
            value={values.description}
            onChange={(event) =>
              setValues((current) => ({ ...current, description: event.target.value }))
            }
          />
        </SettingDialogField>
        <SettingDialogField
          title={t("settings:SETTINGS_SYSTEM_AGENT_INSTRUCTIONS_LABEL")}
          description={t("settings:SETTINGS_SYSTEM_AGENT_INSTRUCTIONS_DESC")}
        >
          <Textarea
            rows={7}
            value={values.instructions}
            onChange={(event) =>
              setValues((current) => ({ ...current, instructions: event.target.value }))
            }
          />
        </SettingDialogField>
        <SettingDialogField
          title={t("settings:SETTINGS_SYSTEM_AGENT_AVATAR_LABEL")}
          description={t("settings:SETTINGS_SYSTEM_AGENT_AVATAR_DESC")}
        >
          <Input
            type="url"
            value={values.avatarUrl}
            placeholder="https://"
            onChange={(event) =>
              setValues((current) => ({ ...current, avatarUrl: event.target.value }))
            }
          />
        </SettingDialogField>
      </SettingDialogFields>
    </SettingDialog>
  );
}

export function AgentDefinitionEditDialog(props: {
  definition: SystemAgentDefinitionDetailOut | null;
  open: boolean;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: SystemAgentDefinitionUpdateRequest) => void;
}) {
  const { t } = useTranslation(["settings", "common"]);
  const [values, setValues] = useState<SystemAgentDefinitionUpdateRequest>({});

  useEffect(() => {
    if (!props.open || !props.definition) return;
    setValues({
      displayName: props.definition.displayName,
      role: props.definition.role,
      description: props.definition.description,
      avatarUrl: props.definition.avatarUrl,
      lifecycleState: props.definition.lifecycleState,
    });
  }, [props.definition, props.open]);

  const valid = values.displayName?.trim() && values.role?.trim() && values.description?.trim();

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t("settings:SETTINGS_SYSTEM_AGENT_EDIT_TITLE")}
      description={t("settings:SETTINGS_SYSTEM_AGENT_EDIT_DESC")}
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>
            {t("common:CANCEL")}
          </Button>
          <Button
            type="button"
            disabled={props.pending || !valid}
            onClick={() => props.onSubmit(values)}
          >
            {t("settings:SETTINGS_SAVE")}
          </Button>
        </>
      }
    >
      <SettingDialogFields>
        <SettingDialogField title={t("settings:SETTINGS_SYSTEM_AGENT_NAME_LABEL")}>
          <Input
            value={values.displayName ?? ""}
            onChange={(event) =>
              setValues((current) => ({ ...current, displayName: event.target.value }))
            }
          />
        </SettingDialogField>
        <SettingDialogField title={t("settings:SETTINGS_SYSTEM_AGENT_ROLE_LABEL")}>
          <Input
            value={values.role ?? ""}
            onChange={(event) => setValues((current) => ({ ...current, role: event.target.value }))}
          />
        </SettingDialogField>
        <SettingDialogField title={t("settings:SETTINGS_SYSTEM_AGENT_DESCRIPTION_LABEL")}>
          <Textarea
            rows={4}
            value={values.description ?? ""}
            onChange={(event) =>
              setValues((current) => ({ ...current, description: event.target.value }))
            }
          />
        </SettingDialogField>
        <SettingDialogField title={t("settings:SETTINGS_SYSTEM_AGENT_LIFECYCLE_LABEL")}>
          <Select
            value={values.lifecycleState ?? "active"}
            onValueChange={(value) =>
              setValues((current) => ({
                ...current,
                lifecycleState: value as "active" | "disabled" | "archived",
              }))
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["active", "disabled", "archived"] as const).map((state) => (
                <SelectItem key={state} value={state}>
                  {t(`settings:SETTINGS_SYSTEM_AGENT_STATE_${state.toUpperCase()}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingDialogField>
        <SettingDialogField
          title={t("settings:SETTINGS_SYSTEM_AGENT_AVATAR_LABEL")}
          description={t("settings:SETTINGS_SYSTEM_AGENT_AVATAR_DESC")}
        >
          <Input
            type="url"
            value={values.avatarUrl ?? ""}
            placeholder="https://"
            onChange={(event) =>
              setValues((current) => ({ ...current, avatarUrl: event.target.value || null }))
            }
          />
        </SettingDialogField>
      </SettingDialogFields>
    </SettingDialog>
  );
}

export function AgentVersionCreateDialog(props: {
  open: boolean;
  pending: boolean;
  definition: SystemAgentDefinitionDetailOut | null;
  delegationOptions: readonly SystemAgentDefinitionSummaryOut[];
  workspaces: readonly SystemDirectoryWorkspace[];
  capabilities: SystemAgentCatalogCapabilitiesOut | undefined;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: AgentVersionCreateRequest) => void;
}) {
  const { t } = useTranslation(["settings", "common"]);
  const [instructions, setInstructions] = useState("");
  const [modes, setModes] = useState<Array<"plan" | "build">>(["plan", "build"]);
  const [delegationIds, setDelegationIds] = useState<string[]>([]);
  const [skillWorkspaceId, setSkillWorkspaceId] = useState("");
  const [skillInstallationIds, setSkillInstallationIds] = useState<string[]>([]);
  const [skillSelectionBlocked, setSkillSelectionBlocked] = useState(false);

  useEffect(() => {
    if (!props.open) return;
    setInstructions(props.definition?.latestVersion?.instructions ?? "");
    setModes(props.definition?.latestVersion?.supportedExecutionModes ?? ["plan", "build"]);
    setDelegationIds(props.definition?.latestVersion?.delegationDefinitionIds ?? []);
    setSkillWorkspaceId(props.definition?.latestVersion?.skillGrantWorkspaceId ?? "");
    setSkillInstallationIds(props.definition?.latestVersion?.skillInstallationIds ?? []);
    setSkillSelectionBlocked(false);
  }, [props.definition, props.open]);

  const toggleMode = (mode: "plan" | "build", checked: boolean) => {
    setModes((current) =>
      checked ? [...new Set([...current, mode])] : current.filter((item) => item !== mode),
    );
  };
  const toggleDelegation = (definitionId: string, checked: boolean) => {
    setDelegationIds((current) =>
      checked
        ? [...new Set([...current, definitionId])]
        : current.filter((item) => item !== definitionId),
    );
  };

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t("settings:SETTINGS_SYSTEM_AGENT_VERSION_CREATE_TITLE")}
      description={t("settings:SETTINGS_SYSTEM_AGENT_VERSION_CREATE_DESC")}
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>
            {t("common:CANCEL")}
          </Button>
          <Button
            type="button"
            disabled={
              props.pending || !instructions.trim() || modes.length === 0 || skillSelectionBlocked
            }
            onClick={() =>
              props.onSubmit(
                versionPayload({
                  instructions,
                  modes,
                  delegationDefinitionIds: delegationIds,
                  skillGrantWorkspaceId: skillWorkspaceId,
                  skillInstallationIds,
                }),
              )
            }
          >
            {t("settings:SETTINGS_SYSTEM_AGENT_VERSION_PUBLISH_ACTION")}
          </Button>
        </>
      }
    >
      <SettingDialogFields>
        <SettingDialogField
          title={t("settings:SETTINGS_SYSTEM_AGENT_INSTRUCTIONS_LABEL")}
          description={t("settings:SETTINGS_SYSTEM_AGENT_VERSION_IMMUTABLE_DESC")}
        >
          <Textarea
            rows={9}
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
          />
        </SettingDialogField>
        <SettingDialogField
          title={t("settings:SETTINGS_SYSTEM_AGENT_SKILL_WORKSPACE_LABEL")}
          description={t("settings:SETTINGS_SYSTEM_AGENT_SKILL_WORKSPACE_DESC")}
        >
          <Select
            value={skillWorkspaceId || "none"}
            onValueChange={(value) => {
              setSkillWorkspaceId(value === "none" ? "" : value);
              setSkillInstallationIds([]);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="none">
                  {t("settings:SETTINGS_SYSTEM_AGENT_SKILL_WORKSPACE_NONE")}
                </SelectItem>
                {props.workspaces.map((workspace) => (
                  <SelectItem key={workspace.workspaceId} value={workspace.workspaceId}>
                    {workspace.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </SettingDialogField>
        <SettingDialogField
          title={t("settings:SETTINGS_SYSTEM_AGENT_SKILL_INSTALLATIONS_LABEL")}
          description={t("settings:SETTINGS_SYSTEM_AGENT_SKILL_INSTALLATIONS_DESC")}
        >
          <AgentSkillGrantFields
            available={props.capabilities?.skillGrantsAvailable}
            workspaceId={skillWorkspaceId}
            selectedInstallationIds={skillInstallationIds}
            supportedToolGrants={props.capabilities?.supportedToolGrants ?? []}
            onInvalidSelectionChange={setSkillSelectionBlocked}
            onSelectionChange={setSkillInstallationIds}
          />
        </SettingDialogField>
        <div className="grid gap-2">
          <div className="text-footnote font-medium text-label-primary">
            {t("settings:SETTINGS_SYSTEM_AGENT_EXECUTION_MODES_LABEL")}
          </div>
          {(["plan", "build"] as const).map((mode) => (
            <label
              key={mode}
              className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5"
            >
              <span className="text-footnote text-label-primary">
                {t(`settings:SETTINGS_SYSTEM_AGENTS_MODE_${mode.toUpperCase()}`)}
              </span>
              <Switch
                checked={modes.includes(mode)}
                onCheckedChange={(checked) => toggleMode(mode, checked)}
              />
            </label>
          ))}
        </div>
        <SettingDialogField
          title={t("settings:SETTINGS_SYSTEM_AGENT_TOOL_GRANTS_LABEL")}
          description={t("settings:SETTINGS_SYSTEM_AGENT_TOOL_GRANTS_DESC")}
        >
          <Input
            readOnly
            value={props.capabilities?.supportedToolGrants.join(", ") ?? "human.request_input"}
            className="font-mono"
          />
        </SettingDialogField>
        {props.delegationOptions.length ? (
          <div className="grid gap-2">
            <div className="text-footnote font-medium text-label-primary">
              {t("settings:SETTINGS_SYSTEM_AGENT_DELEGATION_LABEL")}
            </div>
            <div className="grid max-h-44 gap-1 overflow-y-auto rounded-lg border p-2">
              {props.delegationOptions.map((definition) => (
                <label
                  key={definition.id}
                  className="flex items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-muted/60"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-footnote font-medium text-label-primary">
                      {definition.displayName}
                    </span>
                    <span className="block truncate font-mono text-caption text-label-secondary">
                      {definition.slug}
                    </span>
                  </span>
                  <Switch
                    checked={delegationIds.includes(definition.id)}
                    onCheckedChange={(checked) => toggleDelegation(definition.id, checked)}
                  />
                </label>
              ))}
            </div>
          </div>
        ) : null}
      </SettingDialogFields>
    </SettingDialog>
  );
}

export function AgentAssignmentDialog(props: {
  open: boolean;
  pending: boolean;
  definition: SystemAgentDefinitionDetailOut | null;
  assignment: SystemAgentAssignmentOut | null;
  workspaces: readonly SystemDirectoryWorkspace[];
  workspacesLoading: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (payload: SystemAgentAssignmentCreateRequest) => void;
  onUpdate: (assignmentId: string, payload: SystemAgentAssignmentUpdateRequest) => void;
}) {
  const { t } = useTranslation(["settings", "common"]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [projectId, setProjectId] = useState("workspace");
  const [versionId, setVersionId] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [isDefault, setIsDefault] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [sortOrder, setSortOrder] = useState(0);
  const editing = props.assignment !== null;

  const projectsQuery = useQuery({
    queryKey: ["system", "directory", "projects", "agent-assignment", workspaceId],
    queryFn: () => listSystemDirectoryProjects({ page: 1, size: 100, workspaceId, isActive: true }),
    enabled: props.open && !editing && Boolean(workspaceId),
  });

  useEffect(() => {
    if (!props.open) return;
    setWorkspaceId(props.assignment?.workspaceId ?? "");
    setProjectId(props.assignment?.projectId ?? "workspace");
    setVersionId(props.assignment?.versionId ?? props.definition?.latestVersion?.id ?? "");
    setEnabled(props.assignment?.enabled ?? true);
    setIsDefault(props.assignment?.isDefault ?? false);
    setIsPinned(props.assignment?.isPinned ?? false);
    setSortOrder(props.assignment?.sortOrder ?? 0);
  }, [props.assignment, props.definition, props.open]);

  const versions = useMemo(
    () => (props.definition?.versions ?? []).filter((version) => version.state === "published"),
    [props.definition],
  );
  const selectedVersion = versions.find((version) => version.id === versionId);
  const selectedVersionCompatible = Boolean(
    selectedVersion &&
    (!selectedVersion.skillGrantWorkspaceId ||
      selectedVersion.skillGrantWorkspaceId === workspaceId),
  );
  const valid = Boolean(
    workspaceId &&
    versionId &&
    selectedVersionCompatible &&
    (enabled || !isDefault) &&
    Number.isInteger(sortOrder) &&
    sortOrder >= -10_000 &&
    sortOrder <= 10_000,
  );

  const submit = () => {
    if (props.assignment) {
      props.onUpdate(props.assignment.id, {
        versionId,
        enabled,
        isDefault,
        isPinned,
        sortOrder,
      });
      return;
    }
    if (!props.definition) return;
    props.onCreate({
      workspaceId,
      projectId: projectId === "workspace" ? null : projectId,
      agentId: props.definition.id,
      versionId,
      enabled,
      isDefault,
      isPinned,
      sortOrder,
    });
  };

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={
        editing
          ? t("settings:SETTINGS_SYSTEM_AGENT_ASSIGNMENT_EDIT_TITLE")
          : t("settings:SETTINGS_SYSTEM_AGENT_ASSIGNMENT_CREATE_TITLE")
      }
      description={t("settings:SETTINGS_SYSTEM_AGENT_ASSIGNMENT_DIALOG_DESC")}
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>
            {t("common:CANCEL")}
          </Button>
          <Button type="button" disabled={props.pending || !valid} onClick={submit}>
            {t("settings:SETTINGS_SAVE")}
          </Button>
        </>
      }
    >
      <SettingDialogFields>
        <SettingDialogField title={t("settings:SETTINGS_SYSTEM_AGENT_ASSIGNMENT_WORKSPACE_LABEL")}>
          {editing ? (
            <Input readOnly value={props.assignment?.workspaceName ?? ""} />
          ) : (
            <Select
              value={workspaceId}
              onValueChange={(value) => {
                setWorkspaceId(value);
                setProjectId("workspace");
                const selected = versions.find((version) => version.id === versionId);
                if (selected?.skillGrantWorkspaceId && selected.skillGrantWorkspaceId !== value) {
                  setVersionId("");
                }
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue
                  placeholder={t("settings:SETTINGS_SYSTEM_AGENT_ASSIGNMENT_WORKSPACE_PLACEHOLDER")}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {props.workspaces.map((workspace) => (
                    <SelectItem key={workspace.workspaceId} value={workspace.workspaceId}>
                      {workspace.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          )}
        </SettingDialogField>
        <SettingDialogField
          title={t("settings:SETTINGS_SYSTEM_AGENT_ASSIGNMENT_PROJECT_LABEL")}
          description={t("settings:SETTINGS_SYSTEM_AGENT_ASSIGNMENT_PROJECT_DESC")}
        >
          {editing ? (
            <Input
              readOnly
              value={
                props.assignment?.projectName ??
                t("settings:SETTINGS_SYSTEM_AGENT_ASSIGNMENT_WORKSPACE_SCOPE")
              }
            />
          ) : (
            <Select value={projectId} onValueChange={setProjectId} disabled={!workspaceId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="workspace">
                    {t("settings:SETTINGS_SYSTEM_AGENT_ASSIGNMENT_WORKSPACE_SCOPE")}
                  </SelectItem>
                  {(projectsQuery.data?.items ?? []).map((project) => (
                    <SelectItem key={project.projectId} value={project.projectId}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          )}
        </SettingDialogField>
        <SettingDialogField
          title={t("settings:SETTINGS_SYSTEM_AGENT_ASSIGNMENT_VERSION_LABEL")}
          description={
            workspaceId && !selectedVersionCompatible && versionId
              ? t("settings:SETTINGS_SYSTEM_AGENT_ASSIGNMENT_VERSION_INCOMPATIBLE")
              : t("settings:SETTINGS_SYSTEM_AGENT_ASSIGNMENT_VERSION_DESC")
          }
        >
          <Select value={versionId} onValueChange={setVersionId}>
            <SelectTrigger className="w-full">
              <SelectValue
                placeholder={t("settings:SETTINGS_SYSTEM_AGENT_ASSIGNMENT_VERSION_PLACEHOLDER")}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {versions.map((version) => {
                  const compatible =
                    !version.skillGrantWorkspaceId || version.skillGrantWorkspaceId === workspaceId;
                  return (
                    <SelectItem key={version.id} value={version.id} disabled={!compatible}>
                      {t("settings:SETTINGS_SYSTEM_AGENT_ASSIGNMENT_VERSION_OPTION", {
                        version: version.versionNumber,
                        count: version.skillInstallationIds.length,
                      })}
                    </SelectItem>
                  );
                })}
              </SelectGroup>
            </SelectContent>
          </Select>
          {!editing && props.workspacesLoading ? (
            <p className="text-caption text-label-secondary">{t("common:LOADING")}</p>
          ) : null}
        </SettingDialogField>
        <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
          <span className="text-footnote text-label-primary">
            {t("settings:SETTINGS_SYSTEM_AGENT_ASSIGNMENT_ENABLED_LABEL")}
          </span>
          <Switch
            checked={enabled}
            onCheckedChange={(checked) => {
              setEnabled(checked);
              if (!checked) setIsDefault(false);
            }}
          />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
          <span className="text-footnote text-label-primary">
            {t("settings:SETTINGS_SYSTEM_AGENT_ASSIGNMENT_DEFAULT_LABEL")}
          </span>
          <Switch checked={isDefault} disabled={!enabled} onCheckedChange={setIsDefault} />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
          <span className="text-footnote text-label-primary">
            {t("settings:SETTINGS_SYSTEM_AGENT_ASSIGNMENT_PINNED_LABEL")}
          </span>
          <Switch checked={isPinned} onCheckedChange={setIsPinned} />
        </label>
        <SettingDialogField title={t("settings:SETTINGS_SYSTEM_AGENT_ASSIGNMENT_ORDER_LABEL")}>
          <Input
            type="number"
            min={-10000}
            max={10000}
            value={sortOrder}
            onChange={(event) => setSortOrder(Number(event.target.value))}
          />
        </SettingDialogField>
      </SettingDialogFields>
    </SettingDialog>
  );
}

export type { DefinitionCreateValues };
