import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  AlertTriangleIcon,
  CheckIcon,
  PencilIcon,
  PlayIcon,
  RefreshCwIcon,
  SaveIcon,
  ShieldCheckIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  AI_AGENT_APPROVAL_PROJECT_CONTEXT_REQUIRED,
  approveAIAgentApproval,
  applyAIAgentApproval,
  buildAIAgentApprovalsQueryKey,
  formatAIChatError,
  listAIAgentActionableApprovals,
  modifyAIAgentApproval,
  rejectAIAgentApproval,
  type AgentApprovalRecord,
  type AgentApprovalApplyResponse,
} from "@/api/ai";
import { buildContentModelsQueryKey } from "@/api/content";
import {
  buildContentLibraryModelsQueryKey,
  buildContentLibraryItemQueryKey,
  buildContentLibraryItemsQueryKey,
  buildContentLibraryVersionHistoryQueryKey,
} from "@/pages/projects/content/library/runtime";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { cn } from "@arclayer/lib/utils";
import { Badge } from "@arclayer/ui/badge";
import { Button } from "@arclayer/ui/button";
import { Textarea } from "@arclayer/ui/textarea";

type AIApprovalQueueProps = {
  enabled: boolean;
};

const MAX_VISIBLE_APPROVALS = 3;

type ApprovalModifyInput = {
  approvalId: string;
  fieldsSnapshot?: Record<string, unknown>;
  modelPatch?: Record<string, unknown>;
  changeSummary: string | null;
};

type ApprovalActionSuccess = "approved" | "rejected" | "modified" | "applied";

export function AIApprovalQueue({ enabled }: AIApprovalQueueProps) {
  const { t } = useTranslation(["ai"]);
  const queryClient = useQueryClient();
  const projectId = useWorkspaceStore((s) => s.currentProjectId);
  const [actionSuccess, setActionSuccess] = useState<ApprovalActionSuccess | null>(null);
  const queryKey = useMemo(() => buildAIAgentApprovalsQueryKey(projectId), [projectId]);
  const approvalsQuery = useQuery({
    queryKey,
    queryFn: ({ signal }) => listAIAgentActionableApprovals({ projectId: projectId ?? "", signal }),
    enabled: enabled && Boolean(projectId),
    staleTime: 10_000,
    retry: false,
  });
  const refreshApprovals = () => {
    void queryClient.invalidateQueries({ queryKey });
  };
  const approveMutation = useMutation({
    mutationFn: (approvalId: string) =>
      approveAIAgentApproval({
        projectId: requireProjectId(projectId),
        approvalId,
        reason: t("ai:AI_AGENT_APPROVAL_REASON_APPROVED"),
      }),
    onSuccess: () => {
      setActionSuccess("approved");
      refreshApprovals();
    },
  });
  const rejectMutation = useMutation({
    mutationFn: (approvalId: string) =>
      rejectAIAgentApproval({
        projectId: requireProjectId(projectId),
        approvalId,
        reason: t("ai:AI_AGENT_APPROVAL_REASON_REJECTED"),
      }),
    onSuccess: () => {
      setActionSuccess("rejected");
      refreshApprovals();
    },
  });
  const modifyMutation = useMutation({
    mutationFn: (input: ApprovalModifyInput) =>
      modifyAIAgentApproval({
        projectId: requireProjectId(projectId),
        approvalId: input.approvalId,
        payload: {
          ...(input.fieldsSnapshot ? { fieldsSnapshot: input.fieldsSnapshot } : {}),
          ...(input.modelPatch ? { modelPatch: input.modelPatch } : {}),
          changeSummary: input.changeSummary,
        },
      }),
    onSuccess: () => {
      setActionSuccess("modified");
      refreshApprovals();
    },
  });
  const applyMutation = useMutation({
    mutationFn: (approvalId: string) =>
      applyAIAgentApproval({
        projectId: requireProjectId(projectId),
        approvalId,
      }),
    onSuccess: (result) => {
      setActionSuccess("applied");
      refreshApprovals();
      invalidateAppliedApprovalTarget(queryClient, projectId, result);
    },
  });
  const resetActionFeedback = () => {
    setActionSuccess(null);
    if (!approveMutation.isPending) approveMutation.reset();
    if (!rejectMutation.isPending) rejectMutation.reset();
    if (!modifyMutation.isPending) modifyMutation.reset();
    if (!applyMutation.isPending) applyMutation.reset();
  };

  if (!enabled || !projectId) return null;

  const approvals = (approvalsQuery.data?.approvals ?? []).filter(isActionableApproval);
  if (!approvalsQuery.isLoading && !approvalsQuery.isError && approvals.length === 0) return null;

  const mutationError =
    approveMutation.error ?? rejectMutation.error ?? modifyMutation.error ?? applyMutation.error;
  const visibleApprovals = approvals.slice(0, MAX_VISIBLE_APPROVALS);
  const pendingCount = approvals.filter((approval) => approval.status === "pending").length;
  const readyToApplyCount = approvals.filter((approval) => approval.status === "approved").length;

  return (
    <section
      aria-label={t("ai:AI_AGENT_APPROVAL_QUEUE")}
      className="mb-3 rounded-lg border border-border/60 bg-background/80 p-2.5 shadow-sm"
    >
      <div className="flex items-center gap-2">
        <ShieldCheckIcon className="size-4 text-label-secondary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-footnote font-semibold text-label-primary">
            {t("ai:AI_AGENT_APPROVAL_QUEUE")}
          </div>
          <div className="truncate text-caption text-label-secondary">
            {approvalsQuery.isLoading
              ? t("ai:AI_AGENT_APPROVAL_LOADING")
              : formatApprovalQueueSummary(t, {
                  pendingCount,
                  readyToApplyCount,
                })}
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={t("ai:AI_AGENT_APPROVAL_REFRESH")}
          disabled={approvalsQuery.isFetching}
          onClick={() => {
            setActionSuccess(null);
            refreshApprovals();
          }}
          className="rounded-md text-label-secondary"
        >
          <RefreshCwIcon
            className={cn("size-3.5", approvalsQuery.isFetching && "animate-spin")}
            aria-hidden="true"
          />
        </Button>
      </div>

      {approvalsQuery.isError ? (
        <ApprovalError message={formatAIChatError(approvalsQuery.error)} />
      ) : null}
      {mutationError ? <ApprovalError message={formatAIChatError(mutationError)} /> : null}
      {actionSuccess ? (
        <ApprovalSuccess message={approvalActionSuccessMessage(actionSuccess, t)} />
      ) : null}

      {visibleApprovals.length > 0 ? (
        <div className="mt-2 grid gap-2">
          {visibleApprovals.map((approval) => (
            <ApprovalRow
              key={approval.id}
              approval={approval}
              busy={
                (approveMutation.isPending && approveMutation.variables === approval.id) ||
                (rejectMutation.isPending && rejectMutation.variables === approval.id) ||
                (modifyMutation.isPending &&
                  modifyMutation.variables?.approvalId === approval.id) ||
                (applyMutation.isPending && applyMutation.variables === approval.id)
              }
              onApprove={() => {
                resetActionFeedback();
                approveMutation.mutate(approval.id);
              }}
              onReject={() => {
                resetActionFeedback();
                rejectMutation.mutate(approval.id);
              }}
              onModify={(input) => {
                resetActionFeedback();
                modifyMutation.mutate(input);
              }}
              onApply={() => {
                resetActionFeedback();
                applyMutation.mutate(approval.id);
              }}
            />
          ))}
        </div>
      ) : null}

      {approvals.length > MAX_VISIBLE_APPROVALS ? (
        <div className="mt-2 text-caption text-label-secondary">
          {t("ai:AI_AGENT_APPROVAL_MORE", { count: approvals.length - MAX_VISIBLE_APPROVALS })}
        </div>
      ) : null}
    </section>
  );
}

function ApprovalRow(props: {
  approval: AgentApprovalRecord;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  onModify: (input: ApprovalModifyInput) => void;
  onApply: () => void;
}) {
  const { t } = useTranslation(["ai"]);
  const display = buildApprovalDisplay(props.approval, t);
  const editTarget = editTargetForApproval(props.approval);
  const status = approvalStatusDisplay(props.approval.status, t);
  const approvalPatchText = useMemo(
    () => formatJsonObject(readApprovalEditPatch(props.approval)),
    [props.approval],
  );
  const approvalSummary = readString(props.approval.proposedPatch.changeSummary);
  const [editing, setEditing] = useState(false);
  const [patchText, setPatchText] = useState(() => approvalPatchText);
  const [summary, setSummary] = useState(() => approvalSummary);
  const [editError, setEditError] = useState<string | null>(null);
  const approvalEditVersion = `${props.approval.id}:${props.approval.updatedAt}`;

  useEffect(() => {
    setPatchText(approvalPatchText);
    setSummary(approvalSummary);
    setEditError(null);
    setEditing(false);
  }, [approvalEditVersion, approvalPatchText, approvalSummary]);
  const canModify = props.approval.status === "pending" && editTarget !== null;

  const submitModify = () => {
    let patch: Record<string, unknown>;
    try {
      patch = parseJsonObject(patchText);
    } catch {
      setEditError(t("ai:AI_AGENT_APPROVAL_EDIT_INVALID_JSON"));
      return;
    }
    if (!editTarget) return;
    setEditError(null);
    setEditing(false);
    props.onModify({
      approvalId: props.approval.id,
      ...(editTarget === "fieldsSnapshot" ? { fieldsSnapshot: patch } : { modelPatch: patch }),
      changeSummary: summary.trim() || null,
    });
  };

  return (
    <article className="rounded-md border border-border/50 bg-card/80 p-2">
      <div className="flex min-w-0 items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-footnote font-semibold text-label-primary">
              {display.title}
            </span>
            <Badge
              variant="outline"
              className={cn("max-w-28 truncate px-1.5 py-0 text-[10px]", status.className)}
            >
              {status.label}
            </Badge>
            {display.badge ? (
              <Badge variant="outline" className="max-w-24 truncate px-1.5 py-0 text-[10px]">
                {display.badge}
              </Badge>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-caption text-label-secondary">
            <span>{display.revisionLabel}</span>
            <span aria-hidden="true">/</span>
            <span>{display.countLabel}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {props.approval.status === "pending" ? (
            <>
              {canModify ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("ai:AI_AGENT_APPROVAL_EDIT")}
                  disabled={props.busy}
                  onClick={() => {
                    setEditError(null);
                    setEditing((value) => !value);
                  }}
                  className="rounded-md text-label-secondary hover:text-primary"
                >
                  <PencilIcon className="size-3.5" aria-hidden="true" />
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={t("ai:AI_AGENT_APPROVAL_REJECT")}
                disabled={props.busy}
                onClick={props.onReject}
                className="rounded-md text-label-secondary hover:text-destructive"
              >
                <XIcon className="size-3.5" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={t("ai:AI_AGENT_APPROVAL_APPROVE")}
                disabled={props.busy}
                onClick={props.onApprove}
                className="rounded-md text-label-secondary hover:text-primary"
              >
                <CheckIcon className="size-3.5" aria-hidden="true" />
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={t("ai:AI_AGENT_APPROVAL_APPLY")}
              disabled={props.busy}
              onClick={props.onApply}
              className="rounded-md text-label-secondary hover:text-primary"
            >
              <PlayIcon className="size-3.5" aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>

      {display.change ? (
        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 text-caption">
          <span className="truncate rounded bg-muted px-1.5 py-1 text-label-secondary">
            {display.change.before}
          </span>
          <span className="text-label-tertiary">{display.change.label}</span>
          <span className="truncate rounded bg-accent px-1.5 py-1 text-label-primary">
            {display.change.after}
          </span>
        </div>
      ) : (
        <div className="mt-2 text-caption text-label-secondary">{display.emptyLabel}</div>
      )}

      {editing ? (
        <div className="mt-2 grid gap-2">
          <Textarea
            value={patchText}
            rows={5}
            aria-label={t(
              editTarget === "modelPatch"
                ? "ai:AI_AGENT_APPROVAL_EDIT_MODEL_PATCH"
                : "ai:AI_AGENT_APPROVAL_EDIT_FIELDS",
            )}
            disabled={props.busy}
            onChange={(event) => setPatchText(event.target.value)}
            className="min-h-28 resize-none rounded-md font-mono text-caption"
          />
          <Textarea
            value={summary}
            rows={2}
            aria-label={t("ai:AI_AGENT_APPROVAL_EDIT_SUMMARY")}
            disabled={props.busy}
            onChange={(event) => setSummary(event.target.value)}
            className="min-h-16 resize-none rounded-md text-caption"
          />
          {editError ? <ApprovalError message={editError} /> : null}
          <div className="flex justify-end gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={t("ai:AI_AGENT_APPROVAL_EDIT_CANCEL")}
              disabled={props.busy}
              onClick={() => {
                setEditError(null);
                setEditing(false);
              }}
              className="rounded-md text-label-secondary"
            >
              <XIcon className="size-3.5" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={t("ai:AI_AGENT_APPROVAL_EDIT_SAVE")}
              disabled={props.busy}
              onClick={submitModify}
              className="rounded-md text-label-secondary hover:text-primary"
            >
              <SaveIcon className="size-3.5" aria-hidden="true" />
            </Button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function buildApprovalDisplay(
  approval: AgentApprovalRecord,
  t: (key: string, values?: Record<string, unknown>) => string,
): {
  title: string;
  badge: string;
  revisionLabel: string;
  countLabel: string;
  change: { before: string; label: string; after: string } | null;
  emptyLabel: string;
} {
  if (approval.targetType === "content_model") {
    const snapshotPayload = readRecord(readRecord(approval.targetSnapshot.currentSnapshot).payload);
    const title =
      readString(snapshotPayload.name) ||
      readString(approval.targetSnapshot.contentModelName) ||
      t("ai:AI_AGENT_APPROVAL_MODEL_TARGET");
    const badge = readString(snapshotPayload.singularKey);
    const revision =
      approval.expectedDraftVersion ?? readNumber(approval.dryRun.expectedDraftRevision);
    const affectedItems = readNumber(approval.dryRun.affectedItemsCount);
    const changeSummary = readString(approval.proposedPatch.changeSummary);
    return {
      title,
      badge,
      revisionLabel: t("ai:AI_AGENT_APPROVAL_DRAFT_REVISION", { revision: revision ?? 0 }),
      countLabel: t("ai:AI_AGENT_APPROVAL_AFFECTED_ITEMS", { count: affectedItems ?? 0 }),
      change: changeSummary
        ? {
            before: t("ai:AI_AGENT_APPROVAL_MODEL_SCHEMA"),
            label: t("ai:AI_AGENT_APPROVAL_CHANGE_SUMMARY"),
            after: changeSummary,
          }
        : null,
      emptyLabel: t("ai:AI_AGENT_APPROVAL_NO_SCHEMA_CHANGES"),
    };
  }

  const title = readString(approval.targetSnapshot.title) || t("ai:AI_AGENT_APPROVAL_TARGET");
  const fieldChanges = Array.isArray(approval.dryRun.fieldChanges)
    ? approval.dryRun.fieldChanges
    : [];
  const firstChange = readRecord(fieldChanges[0]);
  return {
    title,
    badge: readString(approval.targetSnapshot.modelKey),
    revisionLabel: t("ai:AI_AGENT_APPROVAL_DRAFT_VERSION", {
      version: approval.expectedDraftVersion ?? approval.dryRun.expectedDraftVersion ?? 0,
    }),
    countLabel: t("ai:AI_AGENT_APPROVAL_FIELD_COUNT", { count: fieldChanges.length }),
    change:
      firstChange && Object.keys(firstChange).length > 0
        ? {
            before: formatValue(firstChange.before),
            label: readString(firstChange.field),
            after: formatValue(firstChange.after),
          }
        : null,
    emptyLabel: t("ai:AI_AGENT_APPROVAL_NO_FIELD_CHANGES"),
  };
}

function isActionableApproval(approval: AgentApprovalRecord): boolean {
  return approval.status === "pending" || approval.status === "approved";
}

function formatApprovalQueueSummary(
  t: (key: string, values?: Record<string, unknown>) => string,
  input: { pendingCount: number; readyToApplyCount: number },
): string {
  if (input.pendingCount > 0 && input.readyToApplyCount > 0) {
    return t("ai:AI_AGENT_APPROVAL_PENDING_AND_READY_COUNT", {
      pending: input.pendingCount,
      ready: input.readyToApplyCount,
    });
  }
  if (input.readyToApplyCount > 0) {
    return t("ai:AI_AGENT_APPROVAL_READY_TO_APPLY_COUNT", { count: input.readyToApplyCount });
  }
  return t("ai:AI_AGENT_APPROVAL_PENDING_COUNT", { count: input.pendingCount });
}

function approvalStatusDisplay(
  status: AgentApprovalRecord["status"],
  t: (key: string) => string,
): { label: string; className: string } {
  if (status === "approved") {
    return {
      label: t("ai:AI_AGENT_APPROVAL_STATUS_READY_TO_APPLY"),
      className: "border-primary/30 bg-primary/10 text-primary",
    };
  }
  return {
    label: t("ai:AI_AGENT_APPROVAL_STATUS_PENDING"),
    className: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  };
}

function approvalActionSuccessMessage(
  action: ApprovalActionSuccess,
  t: (key: string) => string,
): string {
  switch (action) {
    case "approved":
      return t("ai:AI_AGENT_APPROVAL_SUCCESS_APPROVED");
    case "rejected":
      return t("ai:AI_AGENT_APPROVAL_SUCCESS_REJECTED");
    case "modified":
      return t("ai:AI_AGENT_APPROVAL_SUCCESS_MODIFIED");
    case "applied":
      return t("ai:AI_AGENT_APPROVAL_SUCCESS_APPLIED");
  }
}

function invalidateAppliedApprovalTarget(
  queryClient: QueryClient,
  projectId: string | null,
  result: AgentApprovalApplyResponse,
): void {
  if (result.approval.targetType === "content_model") {
    void queryClient.invalidateQueries({ queryKey: buildContentModelsQueryKey(projectId) });
    void queryClient.invalidateQueries({ queryKey: buildContentLibraryModelsQueryKey(projectId) });
    void queryClient.invalidateQueries({ queryKey: buildContentLibraryItemsQueryKey(projectId) });
    return;
  }

  const itemId = result.version?.itemId ?? result.approval.targetId ?? null;
  void queryClient.invalidateQueries({ queryKey: buildContentLibraryItemsQueryKey(projectId) });
  if (!itemId) return;
  void queryClient.invalidateQueries({
    queryKey: buildContentLibraryItemQueryKey(projectId, itemId),
  });
  void queryClient.invalidateQueries({
    queryKey: buildContentLibraryVersionHistoryQueryKey(projectId, itemId),
  });
}

function ApprovalError(props: { message: string }) {
  return (
    <div className="mt-2 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-caption text-destructive">
      <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 break-words">{props.message}</span>
    </div>
  );
}

function ApprovalSuccess(props: { message: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="mt-2 flex items-start gap-2 rounded-md border border-primary/30 bg-primary/10 px-2 py-1.5 text-caption text-primary"
    >
      <CheckIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 break-words">{props.message}</span>
    </div>
  );
}

function requireProjectId(projectId: string | null): string {
  if (!projectId) {
    throw new Error(AI_AGENT_APPROVAL_PROJECT_CONTEXT_REQUIRED);
  }
  return projectId;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function editTargetForApproval(
  approval: AgentApprovalRecord,
): "fieldsSnapshot" | "modelPatch" | null {
  if (approval.targetType === "content_item") return "fieldsSnapshot";
  if (approval.targetType === "content_model") return "modelPatch";
  return null;
}

function readApprovalEditPatch(approval: AgentApprovalRecord): Record<string, unknown> {
  if (approval.targetType === "content_model") {
    return readRecord(approval.proposedPatch.modelPatch);
  }
  return readRecord(approval.proposedPatch.fieldsSnapshot);
}

function parseJsonObject(value: string): Record<string, unknown> {
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Expected a JSON object");
  }
  return parsed as Record<string, unknown>;
}

function formatJsonObject(value: Record<string, unknown>): string {
  return JSON.stringify(value, null, 2);
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "empty";
  if (typeof value === "string") return value || "empty";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}
