import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import {
  type ConvergencePreview,
  type PlanAccessConvergenceApi,
  type RenewalTransitionScheduleOut,
} from "@/api/plan-access-convergence";
import { ApiError } from "@/lib/http";

const STALE_CONVERGENCE_ERRORS = new Set([
  "PLAN_ACCESS_CONVERGENCE_PREVIEW_STALE",
  "PLAN_ACCESS_CONVERGENCE_SUBSCRIPTION_STALE",
  "PLAN_ACCESS_CONVERGENCE_ASSIGNMENTS_STALE",
  "PLAN_ACCESS_CONVERGENCE_REVISION_STALE",
  "SUBSCRIPTION_TRANSITION_PREVIEW_STALE",
]);

export type PlanAccessConvergenceIntent = Readonly<{
  workspaceId: string;
  sourceRevisionId: string;
  targetRevisionId: string;
  expectedSubscriptionRevision: number;
  effectiveAt: string;
}>;

export type UsePlanAccessConvergenceOptions = Readonly<{
  services: PlanAccessConvergenceApi;
  onPreviewed?: (result: ConvergencePreview) => void;
  onScheduled?: (result: RenewalTransitionScheduleOut) => void;
}>;

type CommandIdentity = Readonly<{
  idempotencyKey: string;
  correlationId: string;
}>;

type PreviewCommand = Readonly<{
  intent: PlanAccessConvergenceIntent;
  retainedAssignmentIds: readonly string[];
}>;

type ScheduleCommand = Readonly<{
  intent: PlanAccessConvergenceIntent;
  preview: ConvergencePreview;
  identity: CommandIdentity;
}>;

function intentIdentity(intent: PlanAccessConvergenceIntent): string {
  return [
    intent.workspaceId,
    intent.sourceRevisionId,
    intent.targetRevisionId,
    String(intent.expectedSubscriptionRevision),
    intent.effectiveAt,
  ].join("\u0000");
}

function sortedIds(ids: readonly string[]): string[] {
  return [...ids].sort((left, right) => left.localeCompare(right));
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  const sortedLeft = sortedIds(left);
  const sortedRight = sortedIds(right);
  return (
    sortedLeft.length === sortedRight.length &&
    sortedLeft.every((value, index) => value === sortedRight[index])
  );
}

function commandId(): string {
  return globalThis.crypto.randomUUID();
}

function validatePreview(preview: ConvergencePreview, command: PreviewCommand): ConvergencePreview {
  const { intent, retainedAssignmentIds } = command;
  const matchesEffectiveTime =
    Number.isFinite(Date.parse(preview.effectiveAt)) &&
    Date.parse(preview.effectiveAt) === Date.parse(intent.effectiveAt);
  const matchesContract =
    preview.snapshot.workspaceId === intent.workspaceId &&
    preview.snapshot.sourceRevision.id === intent.sourceRevisionId &&
    preview.snapshot.targetRevision.id === intent.targetRevisionId &&
    preview.snapshot.subscriptionRevision === intent.expectedSubscriptionRevision &&
    matchesEffectiveTime &&
    sameIds(preview.retainedAssignmentIds, retainedAssignmentIds);

  if (!matchesContract) {
    throw new Error("Plan access convergence preview does not match the requested transition");
  }
  return preview;
}

export function isPlanAccessConvergenceStaleError(error: unknown): error is ApiError {
  return error instanceof ApiError && STALE_CONVERGENCE_ERRORS.has(error.error ?? "");
}

export function usePlanAccessConvergence(
  intent: PlanAccessConvergenceIntent,
  options: UsePlanAccessConvergenceOptions,
) {
  const identity = intentIdentity(intent);
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const [previewState, setPreviewState] = useState<Readonly<{
    identity: string;
    value: ConvergencePreview;
  }> | null>(null);
  const [retainedAssignmentIds, setRetainedAssignmentIds] = useState<readonly string[]>([]);
  const [isAcknowledged, setIsAcknowledged] = useState(false);
  const [requiresFreshPreview, setRequiresFreshPreview] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [errorOperation, setErrorOperation] = useState<"preview" | "schedule" | null>(null);
  const [scheduledState, setScheduledState] = useState<Readonly<{
    previewId: string;
    value: RenewalTransitionScheduleOut;
  }> | null>(null);
  const scheduleIdentity = useRef<Readonly<{ previewId: string; value: CommandIdentity }> | null>(
    null,
  );
  const preview = previewState?.identity === identity ? previewState.value : null;
  const scheduledTransition =
    preview !== null && scheduledState?.previewId === preview.id ? scheduledState.value : null;
  const isScheduled = scheduledTransition !== null;

  useEffect(() => {
    setPreviewState(null);
    setRetainedAssignmentIds([]);
    setIsAcknowledged(false);
    setRequiresFreshPreview(false);
    setError(null);
    setErrorOperation(null);
    setScheduledState(null);
    scheduleIdentity.current = null;
  }, [identity]);

  const previewMutation = useMutation({
    retry: false,
    mutationFn: async (command: PreviewCommand) => {
      const idempotencyKey = commandId();
      const result = await options.services.createPreview(command.intent.workspaceId, {
        workspaceId: command.intent.workspaceId,
        sourceRevisionId: command.intent.sourceRevisionId,
        targetRevisionId: command.intent.targetRevisionId,
        expectedSubscriptionRevision: command.intent.expectedSubscriptionRevision,
        effectiveAt: command.intent.effectiveAt,
        retainedAssignmentIds: [...command.retainedAssignmentIds],
        idempotencyKey,
        correlationId: commandId(),
      });
      return validatePreview(result, command);
    },
    onSuccess: (result, command) => {
      if (intentIdentity(command.intent) !== currentIdentity.current) return;
      setPreviewState({ identity: intentIdentity(command.intent), value: result });
      setRetainedAssignmentIds(result.retainedAssignmentIds);
      setIsAcknowledged(false);
      setRequiresFreshPreview(false);
      setError(null);
      setErrorOperation(null);
      setScheduledState(null);
      scheduleIdentity.current = null;
      options.onPreviewed?.(result);
    },
    onError: (nextError, command) => {
      if (intentIdentity(command.intent) !== currentIdentity.current) return;
      setRequiresFreshPreview(isPlanAccessConvergenceStaleError(nextError));
      setError(nextError);
      setErrorOperation("preview");
    },
  });

  const scheduleMutation = useMutation({
    retry: false,
    mutationFn: (command: ScheduleCommand) =>
      options.services.schedule(command.intent.workspaceId, command.preview.id, {
        previewId: command.preview.id,
        expectedPreviewRevision: command.preview.previewRevision,
        convergenceId: command.preview.snapshot.requiresConvergence ? command.preview.id : null,
        idempotencyKey: command.identity.idempotencyKey,
        correlationId: command.identity.correlationId,
      }),
    onSuccess: (result, command) => {
      if (intentIdentity(command.intent) !== currentIdentity.current) return;
      setError(null);
      setErrorOperation(null);
      setScheduledState({ previewId: command.preview.id, value: result });
      options.onScheduled?.(result);
    },
    onError: (nextError, command) => {
      if (intentIdentity(command.intent) !== currentIdentity.current) return;
      setRequiresFreshPreview(isPlanAccessConvergenceStaleError(nextError));
      setError(nextError);
      setErrorOperation("schedule");
    },
  });

  const selectionChanged =
    preview?.snapshot.requiresConvergence === true &&
    !sameIds(retainedAssignmentIds, preview.retainedAssignmentIds);
  const requiresAcknowledgement = preview?.snapshot.requiresConvergence === true;
  const canSchedule =
    preview !== null &&
    !selectionChanged &&
    !requiresFreshPreview &&
    !isScheduled &&
    (!requiresAcknowledgement || isAcknowledged) &&
    !previewMutation.isPending &&
    !scheduleMutation.isPending;

  function reviewAccess(): void {
    const assignmentsToReview = requiresFreshPreview ? [] : retainedAssignmentIds;
    previewMutation.mutate({ intent, retainedAssignmentIds: assignmentsToReview });
  }

  function setAssignmentRetained(assignmentId: string, retained: boolean): void {
    if (!preview?.snapshot.requiresConvergence || isScheduled) return;
    const assignment = preview.snapshot.featureAssignments.find(
      (item) => item.assignmentId === assignmentId,
    );
    if (!assignment) throw new Error(`Unknown convergence assignment: ${assignmentId}`);

    setRetainedAssignmentIds((current) => {
      const alreadyRetained = current.includes(assignmentId);
      if (retained === alreadyRetained) return current;
      if (!retained) return current.filter((id) => id !== assignmentId);

      const limit = preview.snapshot.targetRevision.memberSeatLimits?.[assignment.entitlementKey];
      if (limit === undefined) {
        throw new Error("The target plan does not allow retaining this feature access");
      }
      const selectedForFeature = preview.snapshot.featureAssignments.filter(
        (item) =>
          item.entitlementKey === assignment.entitlementKey && current.includes(item.assignmentId),
      ).length;
      if (limit !== null && selectedForFeature >= limit) return current;
      return [...current, assignmentId];
    });
    setIsAcknowledged(false);
  }

  function schedulePlanChange(): void {
    if (!preview || !canSchedule) return;
    if (scheduleIdentity.current?.previewId !== preview.id) {
      scheduleIdentity.current = {
        previewId: preview.id,
        value: { idempotencyKey: commandId(), correlationId: commandId() },
      };
    }
    scheduleMutation.mutate({ intent, preview, identity: scheduleIdentity.current.value });
  }

  return {
    preview,
    retainedAssignmentIds,
    isAcknowledged,
    setIsAcknowledged,
    requiresFreshPreview,
    error,
    errorOperation,
    scheduledTransition,
    isScheduled,
    selectionChanged,
    canSchedule,
    isPreviewPending: previewMutation.isPending,
    isSchedulePending: scheduleMutation.isPending,
    reviewAccess,
    setAssignmentRetained,
    schedulePlanChange,
  } as const;
}
