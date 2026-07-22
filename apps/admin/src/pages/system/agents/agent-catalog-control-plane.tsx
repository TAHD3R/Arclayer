import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  ArrowRightIcon,
  BotIcon,
  CheckCircle2Icon,
  Edit3Icon,
  GitBranchIcon,
  PinIcon,
  PlusIcon,
  SearchIcon,
  ShieldCheckIcon,
} from "lucide-react";

import {
  SYSTEM_AGENT_CAPABILITIES_QUERY_KEY,
  SYSTEM_AGENT_DEFINITIONS_QUERY_KEY,
  createSystemAgentAssignment,
  createSystemAgentDefinition,
  createSystemAgentVersion,
  getSystemAgentCapabilities,
  getSystemAgentDefinition,
  listSystemAgentDefinitions,
  retireSystemAgentVersion,
  updateSystemAgentAssignment,
  updateSystemAgentDefinition,
} from "@/api/system-agents";
import { listSystemDirectoryWorkspaces } from "@/api/system-directory";
import { notifySuccessText } from "@/lib/notifications";
import { Avatar, AvatarFallback, AvatarImage } from "@arclayer/ui/avatar";
import { Badge } from "@arclayer/ui/badge";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import type {
  AgentVersionCreateRequest,
  SystemAgentAssignmentCreateRequest,
  SystemAgentAssignmentOut,
  SystemAgentAssignmentUpdateRequest,
  SystemAgentDefinitionCreateRequest,
  SystemAgentDefinitionSummaryOut,
  SystemAgentDefinitionUpdateRequest,
  SystemAgentVersionOut,
} from "@arclayer/openapi";

import {
  AgentAssignmentDialog,
  AgentDefinitionCreateDialog,
  AgentDefinitionEditDialog,
  AgentVersionCreateDialog,
  type DefinitionCreateValues,
} from "./agent-control-plane-dialogs";

type ControlDialog =
  | { type: "create-definition" }
  | { type: "edit-definition" }
  | { type: "create-version" }
  | { type: "create-assignment" }
  | { type: "edit-assignment"; assignment: SystemAgentAssignmentOut }
  | { type: "retire-version"; version: SystemAgentVersionOut };

function monogram(name: string): string {
  return name.trim().slice(0, 2).toUpperCase() || "AI";
}

function shortChecksum(value: string): string {
  return value.slice(0, 8);
}

function lifecycleVariant(state: "active" | "disabled" | "archived") {
  if (state === "active") return "default" as const;
  return state === "disabled" ? ("secondary" as const) : ("outline" as const);
}

function DefinitionListItem(props: {
  definition: SystemAgentDefinitionSummaryOut;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation(["settings"]);
  const definition = props.definition;
  return (
    <button
      type="button"
      onClick={props.onSelect}
      className={
        "group flex w-full items-start gap-3 border-b px-3 py-3 text-left transition-colors last:border-b-0 " +
        (props.selected ? "bg-accent/70" : "hover:bg-muted/55")
      }
      aria-current={props.selected ? "true" : undefined}
    >
      <Avatar className="mt-0.5 size-9 rounded-lg">
        {definition.avatarUrl ? <AvatarImage src={definition.avatarUrl} alt="" /> : null}
        <AvatarFallback className="rounded-lg bg-primary/8 font-semibold text-primary">
          {monogram(definition.displayName)}
        </AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-footnote font-semibold text-label-primary">
            {definition.displayName}
          </span>
          {definition.isOfficial ? (
            <ShieldCheckIcon
              className="size-3.5 shrink-0 text-primary"
              aria-label={t("settings:SETTINGS_SYSTEM_AGENT_OFFICIAL")}
            />
          ) : null}
        </span>
        <span className="mt-0.5 block truncate font-mono text-caption text-label-secondary">
          {definition.slug}
        </span>
        <span className="mt-2 flex items-center gap-2 text-caption text-label-secondary">
          <span>v{definition.latestVersion?.versionNumber ?? "—"}</span>
          <span aria-hidden="true">·</span>
          <span>
            {t("settings:SETTINGS_SYSTEM_AGENT_ASSIGNMENT_COUNT", {
              count: definition.assignmentCount,
            })}
          </span>
        </span>
      </span>
    </button>
  );
}

function RelationshipStage(props: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="min-w-0 flex-1 p-4">
      <div className="flex items-center gap-2 text-caption font-semibold uppercase tracking-[0.08em] text-label-secondary">
        {props.icon}
        {props.eyebrow}
      </div>
      <div className="mt-3 truncate text-callout font-semibold text-label-primary">
        {props.title}
      </div>
      <div className="mt-1 line-clamp-2 text-caption leading-5 text-label-secondary">
        {props.description}
      </div>
    </div>
  );
}

function CapabilityNotice(props: {
  capabilities: { skillGrantsAvailable: boolean; knowledgeGrantsAvailable: boolean } | undefined;
}) {
  const { t } = useTranslation(["settings"]);
  if (!props.capabilities) return null;
  if (props.capabilities.knowledgeGrantsAvailable) return null;
  return (
    <div className="flex items-start gap-2.5 border-b bg-amber-500/6 px-4 py-3 text-footnote text-label-secondary">
      <GitBranchIcon className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden="true" />
      <span>{t("settings:SETTINGS_SYSTEM_AGENT_KNOWLEDGE_GRANTS_PENDING_DESC")}</span>
    </div>
  );
}

function VersionList(props: {
  versions: readonly SystemAgentVersionOut[];
  official: boolean;
  pending: boolean;
  workspaceNames: ReadonlyMap<string, string>;
  onRetire: (version: SystemAgentVersionOut) => void;
}) {
  const { t } = useTranslation(["settings"]);
  return (
    <div className="divide-y rounded-lg border">
      {props.versions.map((version) => (
        <div key={version.id} className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-footnote font-semibold text-label-primary">
                v{version.versionNumber}
              </span>
              <Badge variant={version.state === "published" ? "default" : "outline"}>
                {t(`settings:SETTINGS_SYSTEM_AGENT_VERSION_STATE_${version.state.toUpperCase()}`)}
              </Badge>
              <span className="font-mono text-caption text-label-secondary">
                #{shortChecksum(version.contentChecksum)}
              </span>
            </div>
            <p className="mt-1.5 line-clamp-2 text-caption leading-5 text-label-secondary">
              {version.instructions}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {version.supportedExecutionModes.map((mode) => (
                <Badge key={mode} variant="secondary">
                  {mode}
                </Badge>
              ))}
              {version.delegationDefinitionIds.length ? (
                <Badge variant="outline">
                  {t("settings:SETTINGS_SYSTEM_AGENT_DELEGATION_COUNT", {
                    count: version.delegationDefinitionIds.length,
                  })}
                </Badge>
              ) : null}
              {version.skillInstallationIds.length ? (
                <Badge variant="outline">
                  {t("settings:SETTINGS_SYSTEM_AGENT_SKILL_GRANT_COUNT", {
                    count: version.skillInstallationIds.length,
                  })}
                </Badge>
              ) : null}
            </div>
            {version.skillGrantWorkspaceId ? (
              <p className="mt-2 text-caption text-label-secondary">
                {t("settings:SETTINGS_SYSTEM_AGENT_SKILL_GRANT_SCOPE", {
                  workspace:
                    props.workspaceNames.get(version.skillGrantWorkspaceId) ??
                    t("settings:SETTINGS_SYSTEM_AGENT_SKILL_WORKSPACE_UNKNOWN"),
                })}
              </p>
            ) : null}
          </div>
          {!props.official && version.state === "published" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={props.pending}
              onClick={() => props.onRetire(version)}
            >
              {t("settings:SETTINGS_SYSTEM_AGENT_VERSION_RETIRE_ACTION")}
            </Button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function AssignmentList(props: {
  assignments: readonly SystemAgentAssignmentOut[];
  pending: boolean;
  onEdit: (assignment: SystemAgentAssignmentOut) => void;
}) {
  const { t } = useTranslation(["settings"]);
  if (!props.assignments.length) {
    return (
      <div className="rounded-lg border border-dashed px-4 py-8 text-center text-footnote text-label-secondary">
        {t("settings:SETTINGS_SYSTEM_AGENT_ASSIGNMENTS_EMPTY")}
      </div>
    );
  }
  return (
    <div className="divide-y rounded-lg border">
      {props.assignments.map((assignment) => (
        <div key={assignment.id} className="flex items-center gap-3 px-3 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-footnote font-semibold text-label-primary">
                {assignment.projectName ?? assignment.workspaceName}
              </span>
              <Badge variant={assignment.enabled ? "default" : "secondary"}>
                {assignment.enabled
                  ? t("settings:SETTINGS_SYSTEM_AGENT_ASSIGNMENT_ENABLED")
                  : t("settings:SETTINGS_SYSTEM_AGENT_ASSIGNMENT_DISABLED")}
              </Badge>
              {assignment.isDefault ? (
                <Badge variant="outline">
                  {t("settings:SETTINGS_SYSTEM_AGENT_ASSIGNMENT_DEFAULT")}
                </Badge>
              ) : null}
              {assignment.isPinned ? (
                <PinIcon
                  className="size-3.5 text-primary"
                  aria-label={t("settings:SETTINGS_SYSTEM_AGENT_ASSIGNMENT_PINNED")}
                />
              ) : null}
            </div>
            <div className="mt-1 text-caption text-label-secondary">
              {assignment.projectName
                ? assignment.workspaceName
                : t("settings:SETTINGS_SYSTEM_AGENT_ASSIGNMENT_WORKSPACE_SCOPE")}
              <span className="px-1.5" aria-hidden="true">
                ·
              </span>
              v{assignment.versionNumber}
            </div>
          </div>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            disabled={props.pending}
            aria-label={t("settings:SETTINGS_SYSTEM_AGENT_ASSIGNMENT_EDIT_TITLE")}
            onClick={() => props.onEdit(assignment)}
          >
            <Edit3Icon className="size-4" aria-hidden="true" />
          </Button>
        </div>
      ))}
    </div>
  );
}

export function AgentCatalogControlPlane() {
  const { t } = useTranslation(["settings", "common"]);
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<ControlDialog | null>(null);

  const definitionsQuery = useQuery({
    queryKey: [...SYSTEM_AGENT_DEFINITIONS_QUERY_KEY, deferredQuery],
    queryFn: ({ signal }) =>
      listSystemAgentDefinitions({ q: deferredQuery || undefined, page: 1, size: 100, signal }),
  });
  const capabilitiesQuery = useQuery({
    queryKey: SYSTEM_AGENT_CAPABILITIES_QUERY_KEY,
    queryFn: ({ signal }) => getSystemAgentCapabilities(signal),
  });
  const workspacesQuery = useQuery({
    queryKey: ["system", "directory", "workspaces", "agent-control-plane"],
    queryFn: () => listSystemDirectoryWorkspaces({ page: 1, size: 100, isActive: true }),
  });
  const definitions = useMemo(() => definitionsQuery.data?.items ?? [], [definitionsQuery.data]);
  const workspaces = useMemo(() => workspacesQuery.data?.items ?? [], [workspacesQuery.data]);
  const workspaceNames = useMemo(
    () => new Map(workspaces.map((workspace) => [workspace.workspaceId, workspace.name])),
    [workspaces],
  );

  useEffect(() => {
    if (!definitions.length) {
      setSelectedId(null);
      return;
    }
    if (selectedId && definitions.some((definition) => definition.id === selectedId)) return;
    setSelectedId(definitions[0]?.id ?? null);
  }, [definitions, selectedId]);

  const detailQuery = useQuery({
    queryKey: [...SYSTEM_AGENT_DEFINITIONS_QUERY_KEY, "detail", selectedId],
    queryFn: ({ signal }) => getSystemAgentDefinition(String(selectedId), signal),
    enabled: Boolean(selectedId),
  });
  const detail = detailQuery.data ?? null;

  const refreshControlPlane = async (definitionId?: string) => {
    await queryClient.invalidateQueries({ queryKey: SYSTEM_AGENT_DEFINITIONS_QUERY_KEY });
    if (definitionId) {
      await queryClient.invalidateQueries({
        queryKey: [...SYSTEM_AGENT_DEFINITIONS_QUERY_KEY, "detail", definitionId],
      });
    }
  };
  const success = async (definitionId: string) => {
    await refreshControlPlane(definitionId);
    setDialog(null);
    notifySuccessText(t("settings:SETTINGS_SAVED"));
  };

  const createDefinitionMutation = useMutation({
    mutationFn: createSystemAgentDefinition,
    onSuccess: async (created) => {
      setSelectedId(created.id);
      await success(created.id);
    },
  });
  const updateDefinitionMutation = useMutation({
    mutationFn: (input: { definitionId: string; payload: SystemAgentDefinitionUpdateRequest }) =>
      updateSystemAgentDefinition(input.definitionId, input.payload),
    onSuccess: async (updated) => success(updated.id),
  });
  const createVersionMutation = useMutation({
    mutationFn: (input: { definitionId: string; payload: AgentVersionCreateRequest }) =>
      createSystemAgentVersion(input.definitionId, input.payload),
    onSuccess: async (version) => success(version.definitionId),
  });
  const retireVersionMutation = useMutation({
    mutationFn: (input: { definitionId: string; versionId: string }) =>
      retireSystemAgentVersion(input.definitionId, input.versionId),
    onSuccess: async (version) => success(version.definitionId),
  });
  const createAssignmentMutation = useMutation({
    mutationFn: createSystemAgentAssignment,
    onSuccess: async (assignment) => success(assignment.agentId),
  });
  const updateAssignmentMutation = useMutation({
    mutationFn: (input: { assignmentId: string; payload: SystemAgentAssignmentUpdateRequest }) =>
      updateSystemAgentAssignment(input.assignmentId, input.payload),
    onSuccess: async (assignment) => success(assignment.agentId),
  });
  const pending =
    createDefinitionMutation.isPending ||
    updateDefinitionMutation.isPending ||
    createVersionMutation.isPending ||
    retireVersionMutation.isPending ||
    createAssignmentMutation.isPending ||
    updateAssignmentMutation.isPending;

  const createDefinition = (values: DefinitionCreateValues) => {
    const payload: SystemAgentDefinitionCreateRequest = {
      slug: values.slug,
      displayName: values.displayName.trim(),
      role: values.role.trim(),
      description: values.description.trim(),
      avatarUrl: values.avatarUrl.trim() || null,
      initialVersion: {
        instructions: values.instructions.trim(),
        modelPolicy: { routingPolicy: "workspace_default" },
        supportedExecutionModes: ["plan", "build"],
        toolGrants: ["human.request_input"],
        skillGrantWorkspaceId: null,
        skillInstallationIds: [],
        knowledgeBaseIds: [],
        delegationDefinitionIds: [],
        approvalProfile: { profileId: "human-input-v1" },
        compatibility: { agentRuntimeProtocol: 1 },
      },
    };
    createDefinitionMutation.mutate(payload);
  };
  const delegationOptions = definitions.filter(
    (definition) => definition.id !== detail?.id && definition.lifecycleState === "active",
  );
  const activeAssignment = dialog?.type === "edit-assignment" ? dialog.assignment : null;

  return (
    <div
      id="agent-catalog-control-plane"
      className="overflow-hidden rounded-xl border bg-background"
    >
      <div className="flex flex-col gap-3 border-b px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-callout font-semibold text-label-primary">
            <BotIcon className="size-4 text-primary" aria-hidden="true" />
            {t("settings:SETTINGS_SYSTEM_AGENT_CATALOG_TITLE")}
          </div>
          <p className="mt-1 max-w-2xl text-footnote leading-5 text-label-secondary">
            {t("settings:SETTINGS_SYSTEM_AGENT_CATALOG_DESC")}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          className="gap-1.5"
          onClick={() => setDialog({ type: "create-definition" })}
        >
          <PlusIcon className="size-4" aria-hidden="true" />
          {t("settings:SETTINGS_SYSTEM_AGENT_CREATE_ACTION")}
        </Button>
      </div>

      <CapabilityNotice capabilities={capabilitiesQuery.data} />

      <div className="grid min-h-[34rem] lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="border-b lg:border-r lg:border-b-0">
          <div className="border-b p-3">
            <div className="relative">
              <SearchIcon
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-label-secondary"
                aria-hidden="true"
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("settings:SETTINGS_SYSTEM_AGENT_SEARCH_PLACEHOLDER")}
                aria-label={t("settings:SETTINGS_SYSTEM_AGENT_SEARCH_LABEL")}
                className="pl-9"
              />
            </div>
          </div>
          <div className="max-h-[34rem] overflow-y-auto">
            {definitionsQuery.isLoading ? (
              <div className="px-4 py-8 text-center text-footnote text-label-secondary">
                {t("common:LOADING")}
              </div>
            ) : null}
            {!definitionsQuery.isLoading && definitionsQuery.isError ? (
              <div className="px-4 py-8 text-center text-footnote text-destructive">
                {t("settings:SETTINGS_SYSTEM_AGENT_LOAD_FAILED")}
              </div>
            ) : null}
            {!definitionsQuery.isLoading && !definitionsQuery.isError && !definitions.length ? (
              <div className="px-4 py-8 text-center text-footnote text-label-secondary">
                {t("settings:SETTINGS_SYSTEM_AGENT_EMPTY")}
              </div>
            ) : null}
            {definitions.map((definition) => (
              <DefinitionListItem
                key={definition.id}
                definition={definition}
                selected={definition.id === selectedId}
                onSelect={() => setSelectedId(definition.id)}
              />
            ))}
          </div>
        </aside>

        <section className="min-w-0">
          {detailQuery.isLoading ? (
            <div className="grid h-full min-h-80 place-items-center text-footnote text-label-secondary">
              {t("common:LOADING")}
            </div>
          ) : null}
          {!detailQuery.isLoading && detailQuery.isError ? (
            <div className="grid h-full min-h-80 place-items-center px-6 text-center text-footnote text-destructive">
              {t("settings:SETTINGS_SYSTEM_AGENT_DETAIL_LOAD_FAILED")}
            </div>
          ) : null}
          {detail ? (
            <div>
              <div className="flex flex-col gap-4 border-b p-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 gap-3">
                  <Avatar className="size-11 rounded-xl">
                    {detail.avatarUrl ? <AvatarImage src={detail.avatarUrl} alt="" /> : null}
                    <AvatarFallback className="rounded-xl bg-primary/8 font-semibold text-primary">
                      {monogram(detail.displayName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-title3 font-semibold text-label-primary">
                        {detail.displayName}
                      </h3>
                      <Badge variant={lifecycleVariant(detail.lifecycleState)}>
                        {t(
                          `settings:SETTINGS_SYSTEM_AGENT_STATE_${detail.lifecycleState.toUpperCase()}`,
                        )}
                      </Badge>
                      {detail.isOfficial ? (
                        <Badge variant="outline" className="gap-1">
                          <ShieldCheckIcon className="size-3" />
                          {t("settings:SETTINGS_SYSTEM_AGENT_OFFICIAL")}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="mt-1 font-mono text-caption text-label-secondary">
                      {detail.stableKey}
                    </div>
                    <p className="mt-2 max-w-2xl text-footnote leading-5 text-label-secondary">
                      {detail.description}
                    </p>
                  </div>
                </div>
                {!detail.isOfficial ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => setDialog({ type: "edit-definition" })}
                  >
                    <Edit3Icon className="size-4" />
                    {t("settings:SETTINGS_SYSTEM_AGENT_EDIT_ACTION")}
                  </Button>
                ) : null}
              </div>

              <div className="p-5">
                <div className="flex flex-col overflow-hidden rounded-xl border bg-muted/20 md:flex-row md:items-stretch">
                  <RelationshipStage
                    icon={<BotIcon className="size-3.5" />}
                    eyebrow={t("settings:SETTINGS_SYSTEM_AGENT_STAGE_DEFINITION")}
                    title={detail.role}
                    description={t("settings:SETTINGS_SYSTEM_AGENT_STAGE_DEFINITION_DESC")}
                  />
                  <ArrowRightIcon
                    className="mx-auto size-4 rotate-90 self-center text-label-secondary md:rotate-0"
                    aria-hidden="true"
                  />
                  <RelationshipStage
                    icon={<GitBranchIcon className="size-3.5" />}
                    eyebrow={t("settings:SETTINGS_SYSTEM_AGENT_STAGE_VERSION")}
                    title={`v${detail.latestVersion?.versionNumber ?? "—"}`}
                    description={
                      detail.latestVersion
                        ? `#${shortChecksum(detail.latestVersion.contentChecksum)} · ${detail.latestVersion.supportedExecutionModes.join(" / ")}`
                        : t("settings:SETTINGS_SYSTEM_AGENT_VERSION_EMPTY")
                    }
                  />
                  <ArrowRightIcon
                    className="mx-auto size-4 rotate-90 self-center text-label-secondary md:rotate-0"
                    aria-hidden="true"
                  />
                  <RelationshipStage
                    icon={<CheckCircle2Icon className="size-3.5" />}
                    eyebrow={t("settings:SETTINGS_SYSTEM_AGENT_STAGE_ASSIGNMENT")}
                    title={t("settings:SETTINGS_SYSTEM_AGENT_ENABLED_ASSIGNMENT_COUNT", {
                      count: detail.enabledAssignmentCount,
                    })}
                    description={t("settings:SETTINGS_SYSTEM_AGENT_STAGE_ASSIGNMENT_DESC")}
                  />
                </div>

                <div className="mt-6 grid gap-6 xl:grid-cols-2">
                  <div className="min-w-0">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <h4 className="text-callout font-semibold text-label-primary">
                          {t("settings:SETTINGS_SYSTEM_AGENT_VERSIONS_TITLE")}
                        </h4>
                        <p className="mt-0.5 text-caption text-label-secondary">
                          {t("settings:SETTINGS_SYSTEM_AGENT_VERSIONS_DESC")}
                        </p>
                      </div>
                      {!detail.isOfficial && detail.lifecycleState !== "archived" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setDialog({ type: "create-version" })}
                        >
                          {t("settings:SETTINGS_SYSTEM_AGENT_VERSION_CREATE_ACTION")}
                        </Button>
                      ) : null}
                    </div>
                    <VersionList
                      versions={detail.versions ?? []}
                      official={detail.isOfficial}
                      pending={pending}
                      workspaceNames={workspaceNames}
                      onRetire={(version) => setDialog({ type: "retire-version", version })}
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <h4 className="text-callout font-semibold text-label-primary">
                          {t("settings:SETTINGS_SYSTEM_AGENT_ASSIGNMENTS_TITLE")}
                        </h4>
                        <p className="mt-0.5 text-caption text-label-secondary">
                          {t("settings:SETTINGS_SYSTEM_AGENT_ASSIGNMENTS_DESC")}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setDialog({ type: "create-assignment" })}
                      >
                        {t("settings:SETTINGS_SYSTEM_AGENT_ASSIGNMENT_CREATE_ACTION")}
                      </Button>
                    </div>
                    <AssignmentList
                      assignments={detail.assignments ?? []}
                      pending={pending}
                      onEdit={(assignment) => setDialog({ type: "edit-assignment", assignment })}
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </section>
      </div>

      <AgentDefinitionCreateDialog
        open={dialog?.type === "create-definition"}
        pending={pending}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        onSubmit={createDefinition}
      />
      <AgentDefinitionEditDialog
        definition={detail}
        open={dialog?.type === "edit-definition"}
        pending={pending}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        onSubmit={(payload) => {
          if (detail) updateDefinitionMutation.mutate({ definitionId: detail.id, payload });
        }}
      />
      <AgentVersionCreateDialog
        definition={detail}
        delegationOptions={delegationOptions}
        workspaces={workspaces}
        capabilities={capabilitiesQuery.data}
        open={dialog?.type === "create-version"}
        pending={pending}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        onSubmit={(payload) => {
          if (detail) createVersionMutation.mutate({ definitionId: detail.id, payload });
        }}
      />
      <AgentAssignmentDialog
        definition={detail}
        assignment={activeAssignment}
        workspaces={workspaces}
        workspacesLoading={workspacesQuery.isLoading}
        open={dialog?.type === "create-assignment" || dialog?.type === "edit-assignment"}
        pending={pending}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        onCreate={(payload: SystemAgentAssignmentCreateRequest) =>
          createAssignmentMutation.mutate(payload)
        }
        onUpdate={(assignmentId, payload) =>
          updateAssignmentMutation.mutate({ assignmentId, payload })
        }
      />
      <SettingDialog
        open={dialog?.type === "retire-version"}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        title={t("settings:SETTINGS_SYSTEM_AGENT_VERSION_RETIRE_TITLE")}
        description={t("settings:SETTINGS_SYSTEM_AGENT_VERSION_RETIRE_DESC")}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setDialog(null)}>
              {t("common:CANCEL")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={() => {
                if (detail && dialog?.type === "retire-version")
                  retireVersionMutation.mutate({
                    definitionId: detail.id,
                    versionId: dialog.version.id,
                  });
              }}
            >
              {t("settings:SETTINGS_SYSTEM_AGENT_VERSION_RETIRE_ACTION")}
            </Button>
          </>
        }
      >
        <p className="text-footnote text-label-secondary">
          {dialog?.type === "retire-version"
            ? `v${dialog.version.versionNumber} · #${shortChecksum(dialog.version.contentChecksum)}`
            : null}
        </p>
      </SettingDialog>
    </div>
  );
}
