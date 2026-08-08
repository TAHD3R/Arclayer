import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useCallback, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type {
  CreditAdjustmentOut,
  CreditAdjustmentRequest,
  WorkspaceCreditsOut,
} from "@arclayer/platform-openapi";

import {
  adjustWorkspaceCredits,
  getWorkspaceCommerceOverview,
  PlatformCommerceApiError,
} from "@/commerce/commerce-api";
import { CommercePage, CommerceQueryState } from "@/commerce/commerce-ui";
import { useMonitoringQuery } from "@/monitoring/monitoring-ui";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SettingDialog } from "@/components/setting-dialog";
import { SettingDialogField, SettingDialogFields } from "@/components/setting-dialog-field";
import { Textarea } from "@/components/ui/textarea";

type AdjustmentEvidence = Readonly<{
  beforeBalance: number;
  result: CreditAdjustmentOut;
}>;

export function CommerceCreditsPage() {
  const { t } = useTranslation("commerce");
  const [workspaceId, setWorkspaceId] = useState("");
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmittedId(workspaceId.trim() || null);
  };
  return (
    <CommercePage description={t("CREDITS_DESCRIPTION")} title={t("CREDITS_TITLE")}>
      <Card>
        <CardHeader>
          <CardTitle>{t("WORKSPACE")}</CardTitle>
          <CardDescription>{t("CREDITS_LOOKUP_DESCRIPTION")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex max-w-xl gap-2" onSubmit={submit}>
            <Input
              aria-label={t("WORKSPACE")}
              onChange={(event) => setWorkspaceId(event.target.value)}
              placeholder={t("WORKSPACE_ID_PLACEHOLDER")}
              value={workspaceId}
            />
            <Button disabled={!workspaceId.trim()} type="submit">
              {t("LOOK_UP")}
            </Button>
          </form>
        </CardContent>
      </Card>
      {submittedId ? <WorkspaceCredits workspaceId={submittedId} /> : null}
    </CommercePage>
  );
}

function WorkspaceCredits({ workspaceId }: Readonly<{ workspaceId: string }>) {
  const [adjustment, setAdjustment] = useState<AdjustmentEvidence | null>(null);
  const load = useCallback(() => getWorkspaceCommerceOverview(workspaceId), [workspaceId]);
  const { state, retry } = useMonitoringQuery(load, [workspaceId]);
  return (
    <CommerceQueryState isEmpty={() => false} retry={retry} state={state}>
      {(data) => (
        <div className="space-y-5">
          {adjustment ? <AdjustmentApplied evidence={adjustment} /> : null}
          <WorkspaceCreditsCard
            credits={data.credits}
            onAdjusted={(result) => {
              setAdjustment({ beforeBalance: data.credits.balance, result });
              retry();
            }}
            workspaceId={workspaceId}
          />
        </div>
      )}
    </CommerceQueryState>
  );
}

export function WorkspaceCreditsCard({
  credits,
  workspaceId,
  onAdjusted,
}: Readonly<{
  credits: WorkspaceCreditsOut;
  workspaceId: string;
  onAdjusted: (result: CreditAdjustmentOut) => void;
}>) {
  const { t } = useTranslation("commerce");
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>{t("CREDIT_BALANCE")}</CardTitle>
          <CardDescription>{t("CREDITS_BALANCE_DESCRIPTION")}</CardDescription>
        </div>
        <Button onClick={() => setOpen(true)}>{t("ADJUST_CREDITS")}</Button>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-3">
        <CreditFact label={t("BALANCE")} value={credits.balance} />
        <CreditFact label={t("RESERVED")} value={credits.reserved} />
        <CreditFact label={t("AVAILABLE")} value={credits.available} />
      </CardContent>
      <CreditAdjustmentDialog
        credits={credits}
        onCompleted={onAdjusted}
        onOpenChange={setOpen}
        open={open}
        workspaceId={workspaceId}
      />
    </Card>
  );
}

function CreditAdjustmentDialog({
  credits,
  workspaceId,
  open,
  onOpenChange,
  onCompleted,
}: Readonly<{
  credits: WorkspaceCreditsOut;
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted: (result: CreditAdjustmentOut) => void;
}>) {
  const { t } = useTranslation("commerce");
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [evidenceReference, setEvidenceReference] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const requestRef = useRef<{ fingerprint: string; idempotencyKey: string } | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const deltaCredits = Number(delta);
    if (!Number.isSafeInteger(deltaCredits) || deltaCredits === 0) {
      return setError("CREDIT_ADJUSTMENT_DELTA_INVALID");
    }
    if (!reason.trim()) return setError("CREDIT_ADJUSTMENT_REASON_REQUIRED");
    if (!evidenceReference.trim()) return setError("CREDIT_ADJUSTMENT_EVIDENCE_REQUIRED");
    setPending(true);
    setError(null);
    const fingerprint = JSON.stringify([
      deltaCredits,
      reason.trim(),
      evidenceReference.trim(),
      credits.accountRevision,
    ]);
    if (requestRef.current?.fingerprint !== fingerprint) {
      requestRef.current = { fingerprint, idempotencyKey: crypto.randomUUID() };
    }
    try {
      const request: CreditAdjustmentRequest & { expiresAt: null } = {
        deltaCredits,
        evidenceReference: evidenceReference.trim(),
        expiresAt: null,
        expectedAccountRevision: credits.accountRevision,
        idempotencyKey: requestRef.current.idempotencyKey,
        reason: reason.trim(),
      };
      const result = await adjustWorkspaceCredits(workspaceId, request);
      onCompleted(result);
      onOpenChange(false);
      setDelta("");
      setReason("");
      setEvidenceReference("");
      requestRef.current = null;
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  };

  return (
    <SettingDialog
      description={t("CREDIT_ADJUSTMENT_DESCRIPTION")}
      footer={
        <>
          <Button disabled={pending} onClick={() => onOpenChange(false)} variant="outline">
            {t("CANCEL")}
          </Button>
          <Button loading={pending} form="credit-adjustment" type="submit">
            {t("APPLY_ADJUSTMENT")}
          </Button>
        </>
      }
      onOpenChange={(nextOpen) => !pending && onOpenChange(nextOpen)}
      open={open}
      title={t("ADJUST_CREDITS")}
    >
      <form id="credit-adjustment" onSubmit={submit}>
        <SettingDialogFields>
          <CreditAdjustmentCurrentState credits={credits} />
          {error ? <CreditAdjustmentError error={error} /> : null}
          <SettingDialogField
            description={t("CREDIT_DELTA_DESCRIPTION")}
            title={<label htmlFor="credit-delta">{t("CREDIT_DELTA")}</label>}
          >
            <Input
              id="credit-delta"
              inputMode="numeric"
              onChange={(event) => setDelta(event.target.value)}
              placeholder={t("CREDIT_DELTA_PLACEHOLDER")}
              required
              step="1"
              type="number"
              value={delta}
            />
          </SettingDialogField>
          <SettingDialogField title={<label htmlFor="credit-reason">{t("REASON")}</label>}>
            <Textarea
              id="credit-reason"
              maxLength={1000}
              onChange={(event) => setReason(event.target.value)}
              placeholder={t("CREDIT_REASON_PLACEHOLDER")}
              required
              rows={4}
              value={reason}
            />
          </SettingDialogField>
          <SettingDialogField
            description={t("EVIDENCE_REFERENCE_DESCRIPTION")}
            title={<label htmlFor="credit-evidence">{t("EVIDENCE_REFERENCE")}</label>}
          >
            <Input
              id="credit-evidence"
              maxLength={255}
              onChange={(event) => setEvidenceReference(event.target.value)}
              placeholder={t("EVIDENCE_REFERENCE_PLACEHOLDER")}
              required
              value={evidenceReference}
            />
          </SettingDialogField>
        </SettingDialogFields>
      </form>
    </SettingDialog>
  );
}

function CreditAdjustmentCurrentState({ credits }: Readonly<{ credits: WorkspaceCreditsOut }>) {
  const { t } = useTranslation("commerce");
  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <p className="font-medium">{t("CURRENT_CREDIT_STATE")}</p>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">{t("BALANCE")}</dt>
          <dd>{credits.balance}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("RESERVED")}</dt>
          <dd>{credits.reserved}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("AVAILABLE")}</dt>
          <dd>{credits.available}</dd>
        </div>
      </dl>
      <p className="mt-3 font-mono text-xs text-muted-foreground">
        {t("ACCOUNT_REVISION", { revision: credits.accountRevision })}
      </p>
    </div>
  );
}

function CreditAdjustmentError({ error }: Readonly<{ error: unknown }>) {
  const { t } = useTranslation("commerce");
  const code =
    error instanceof PlatformCommerceApiError
      ? error.message
      : typeof error === "string"
        ? error
        : "CREDIT_ADJUSTMENT_REQUEST_FAILED";
  const denied = error instanceof PlatformCommerceApiError && error.status === 403;
  const title = denied
    ? "CREDIT_ADJUSTMENT_PERMISSION_ERROR"
    : code === "WORKSPACE_CREDIT_ACCOUNT_REVISION_STALE"
      ? "CREDIT_ADJUSTMENT_STALE_ERROR"
      : code === "CREDIT_ADJUSTMENT_WOULD_OVERDRAW_RESERVED_CREDITS"
        ? "CREDIT_ADJUSTMENT_RESERVED_ERROR"
        : "CREDIT_ADJUSTMENT_ERROR";
  return (
    <Alert variant="destructive">
      <AlertTriangle aria-hidden="true" />
      <AlertTitle>{t(title)}</AlertTitle>
      <AlertDescription>
        <p>{t("CREDIT_ADJUSTMENT_UNCHANGED")}</p>
        <p className="font-mono text-xs">{code}</p>
      </AlertDescription>
    </Alert>
  );
}

function AdjustmentApplied({ evidence }: Readonly<{ evidence: AdjustmentEvidence }>) {
  const { t } = useTranslation("commerce");
  return (
    <Alert role="status">
      <CheckCircle2 aria-hidden="true" />
      <AlertTitle>{t("CREDIT_ADJUSTMENT_APPLIED")}</AlertTitle>
      <AlertDescription className="space-y-1">
        <p>
          {t("CREDIT_ADJUSTMENT_RESULT", {
            before: evidence.beforeBalance,
            after: evidence.result.balance,
            revision: evidence.result.accountRevision,
          })}
        </p>
        <p className="font-mono text-xs">
          {t("LEDGER_ENTRY_ID", { id: evidence.result.ledgerEntryId })}
        </p>
        <p className="font-mono text-xs">
          {t("AUDIT_EVENT_ID", { id: evidence.result.auditEventId })}
        </p>
      </AlertDescription>
    </Alert>
  );
}

function CreditFact(props: Readonly<{ label: string; value: number }>) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-sm text-muted-foreground">{props.label}</p>
      <p className="text-lg font-semibold">{props.value}</p>
    </div>
  );
}
