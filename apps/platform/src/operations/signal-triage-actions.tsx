import { useCallback, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type {
  OperationalSignalAssigneeOut,
  OperationalSignalDetailOut,
} from "@arclayer/platform-openapi";

import {
  addOperationalSignalNote,
  assignOperationalSignal,
  claimOperationalSignal,
  listOperationalSignalEligibleAssignees,
  markOperationalSignalInProgress,
  markOperationalSignalNeedsAttention,
  remindOperationalSignalLater,
} from "@/operations/operations-api";
import { useOperationsMutation, useOperationsQuery } from "@/operations/operations-state";
import { OperationsFailure } from "@/operations/operations-ui";
import { Alert, AlertDescription } from "@arclayer/ui/alert";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { Label } from "@arclayer/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { Textarea } from "@arclayer/ui/textarea";

type TriageRequest =
  | Readonly<{ action: "claim" }>
  | Readonly<{ action: "assign"; assigneeUserId: string }>
  | Readonly<{ action: "transfer"; assigneeUserId: string }>
  | Readonly<{ action: "in_progress" }>
  | Readonly<{ action: "needs_attention" }>
  | Readonly<{ action: "remind_later"; reminderAt: string; reason: string }>
  | Readonly<{ action: "note"; body: string }>;

function operatorLabel(operator: OperationalSignalAssigneeOut): string {
  return operator.displayName?.trim() || operator.username;
}

async function applyTriageRequest(
  detail: OperationalSignalDetailOut,
  request: TriageRequest,
): Promise<OperationalSignalDetailOut> {
  const { id, triage } = detail;
  switch (request.action) {
    case "claim":
      return claimOperationalSignal(id, triage.revision);
    case "assign":
    case "transfer":
      return assignOperationalSignal(id, request.assigneeUserId, triage.revision);
    case "in_progress":
      return markOperationalSignalInProgress(id, triage.revision);
    case "needs_attention":
      return markOperationalSignalNeedsAttention(id, triage.revision);
    case "remind_later":
      return remindOperationalSignalLater(id, triage.revision, request.reminderAt, request.reason);
    case "note":
      return addOperationalSignalNote(id, triage.revision, request.body);
  }
}

function loadEligibleAssignees(signal: AbortSignal) {
  return listOperationalSignalEligibleAssignees(signal);
}

function AssignControl({
  disabled,
  execute,
  mode,
}: Readonly<{
  disabled: boolean;
  execute: (request: TriageRequest) => Promise<OperationalSignalDetailOut | undefined>;
  mode: "assign" | "transfer";
}>) {
  const { t } = useTranslation("inbox");
  const [assigneeUserId, setAssigneeUserId] = useState("");
  const { state, retry } = useOperationsQuery(loadEligibleAssignees, []);

  if (state.status === "loading") {
    return <p className="text-footnote text-label-secondary">{t("ASSIGNEES_LOADING")}</p>;
  }
  if (state.status === "error") {
    return (
      <div className="space-y-2">
        <p role="alert" className="text-footnote text-destructive">
          {t("ASSIGNEES_ERROR")}
        </p>
        <Button onClick={retry} size="sm" variant="outline">
          {t("RETRY")}
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <div className="space-y-2">
        <Label htmlFor="signal-assignee">
          {t(mode === "transfer" ? "TRANSFER_TO" : "ASSIGN_TO")}
        </Label>
        <Select onValueChange={setAssigneeUserId} value={assigneeUserId}>
          <SelectTrigger id="signal-assignee">
            <SelectValue placeholder={t("ASSIGN_PLACEHOLDER")} />
          </SelectTrigger>
          <SelectContent>
            {state.data.map((operator) => (
              <SelectItem key={operator.userId} value={operator.userId}>
                {operatorLabel(operator)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button
        disabled={disabled || !assigneeUserId}
        onClick={() => execute({ action: mode, assigneeUserId })}
        variant="outline"
      >
        {t(mode === "transfer" ? "TRANSFER_SUBMIT" : "ASSIGN_SUBMIT")}
      </Button>
    </div>
  );
}

function NoteControl({
  disabled,
  execute,
}: Readonly<{
  disabled: boolean;
  execute: (request: TriageRequest) => Promise<OperationalSignalDetailOut | undefined>;
}>) {
  const { t } = useTranslation("inbox");
  const [body, setBody] = useState("");
  const [invalid, setInvalid] = useState(false);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextBody = body.trim();
    setInvalid(!nextBody);
    if (!nextBody) return;
    void execute({ action: "note", body: nextBody }).then((result) => {
      if (result) setBody("");
    });
  };

  return (
    <form className="grid gap-2" onSubmit={submit}>
      <Label htmlFor="signal-note">{t("NOTE")}</Label>
      <Textarea
        aria-invalid={invalid}
        id="signal-note"
        onChange={(event) => setBody(event.target.value)}
        placeholder={t("NOTE_PLACEHOLDER")}
        value={body}
      />
      {invalid && <p className="text-caption text-destructive">{t("NOTE_REQUIRED")}</p>}
      <Button className="justify-self-start" disabled={disabled} type="submit" variant="outline">
        {t("ADD_NOTE")}
      </Button>
    </form>
  );
}

function ReminderControl({
  disabled,
  execute,
}: Readonly<{
  disabled: boolean;
  execute: (request: TriageRequest) => Promise<OperationalSignalDetailOut | undefined>;
}>) {
  const { t } = useTranslation("inbox");
  const [reminderAt, setReminderAt] = useState("");
  const [reason, setReason] = useState("");
  const [timeInvalid, setTimeInvalid] = useState(false);
  const [reasonInvalid, setReasonInvalid] = useState(false);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedTime = new Date(reminderAt);
    const nextTimeInvalid =
      !reminderAt || Number.isNaN(parsedTime.getTime()) || parsedTime <= new Date();
    const nextReasonInvalid = !reason.trim();
    setTimeInvalid(nextTimeInvalid);
    setReasonInvalid(nextReasonInvalid);
    if (nextTimeInvalid || nextReasonInvalid) return;
    void execute({
      action: "remind_later",
      reminderAt: parsedTime.toISOString(),
      reason: reason.trim(),
    });
  };

  return (
    <form className="grid gap-3 rounded-md border p-3" onSubmit={submit}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="signal-reminder-at">{t("REMINDER_TIME")}</Label>
          <Input
            aria-invalid={timeInvalid}
            id="signal-reminder-at"
            onChange={(event) => setReminderAt(event.target.value)}
            type="datetime-local"
            value={reminderAt}
          />
          {timeInvalid && (
            <p className="text-caption text-destructive">{t("REMINDER_TIME_REQUIRED")}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="signal-reminder-reason">{t("REMINDER_REASON")}</Label>
          <Textarea
            aria-invalid={reasonInvalid}
            id="signal-reminder-reason"
            onChange={(event) => setReason(event.target.value)}
            placeholder={t("REMINDER_REASON_PLACEHOLDER")}
            value={reason}
          />
          {reasonInvalid && (
            <p className="text-caption text-destructive">{t("REMINDER_REASON_REQUIRED")}</p>
          )}
        </div>
      </div>
      <Button className="justify-self-start" disabled={disabled} type="submit" variant="outline">
        {t("REMINDER_SUBMIT")}
      </Button>
    </form>
  );
}

export function SignalTriageActions({
  detail,
  onReload,
  onUpdated,
}: Readonly<{
  detail: OperationalSignalDetailOut;
  onReload: () => void;
  onUpdated: (detail: OperationalSignalDetailOut) => void | Promise<void>;
}>) {
  const { t } = useTranslation("inbox");
  const [success, setSuccess] = useState(false);
  const mutate = useCallback(
    (request: TriageRequest) => applyTriageRequest(detail, request),
    [detail],
  );
  const handleSuccess = useCallback(
    async (updated: OperationalSignalDetailOut) => {
      setSuccess(true);
      await onUpdated(updated);
    },
    [onUpdated],
  );
  const mutation = useOperationsMutation(mutate, handleSuccess);
  const execute = useCallback(
    (request: TriageRequest) => {
      setSuccess(false);
      return mutation.execute(request);
    },
    [mutation.execute],
  );
  const allowed = new Set(detail.allowedTriageActions);
  const disabled = mutation.state.status === "pending";
  const reload = () => {
    setSuccess(false);
    mutation.reset();
    onReload();
  };

  return (
    <section aria-labelledby="signal-actions-heading" className="space-y-4 rounded-lg border p-4">
      <div className="space-y-1">
        <h2 className="font-semibold" id="signal-actions-heading">
          {t("ACTIONS_TITLE")}
        </h2>
        <p className="text-footnote text-label-secondary">{t("ACTIONS_DESCRIPTION")}</p>
      </div>

      {mutation.state.status === "error" && (
        <OperationsFailure error={mutation.state.error} retry={reload} />
      )}
      {success && (
        <Alert>
          <AlertDescription>{t("ACTION_APPLIED")}</AlertDescription>
        </Alert>
      )}

      {!allowed.size && (
        <p className="text-footnote text-label-secondary">{t("NO_ALLOWED_ACTIONS")}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {allowed.has("claim") && (
          <Button disabled={disabled} onClick={() => execute({ action: "claim" })}>
            {t("CLAIM")}
          </Button>
        )}
        {allowed.has("in_progress") && (
          <Button
            disabled={disabled}
            onClick={() => execute({ action: "in_progress" })}
            variant="outline"
          >
            {t("MARK_IN_PROGRESS")}
          </Button>
        )}
        {allowed.has("needs_attention") && (
          <Button
            disabled={disabled}
            onClick={() => execute({ action: "needs_attention" })}
            variant="outline"
          >
            {t("MARK_NEEDS_ATTENTION")}
          </Button>
        )}
      </div>
      {(allowed.has("assign") || allowed.has("transfer")) && (
        <AssignControl
          disabled={disabled}
          execute={execute}
          mode={allowed.has("transfer") ? "transfer" : "assign"}
        />
      )}
      {allowed.has("remind_later") && <ReminderControl disabled={disabled} execute={execute} />}
      {allowed.has("note_added") && <NoteControl disabled={disabled} execute={execute} />}
    </section>
  );
}
