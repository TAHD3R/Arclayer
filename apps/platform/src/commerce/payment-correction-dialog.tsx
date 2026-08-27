import { useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { recordCommercePaymentCorrection } from "@/commerce/commerce-api";
import type { IdempotencyAttempt } from "@/commerce/commerce-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SettingDialog } from "@/components/setting-dialog";

type CorrectionForm = Readonly<{
  providerAccountId: string;
  providerEventId: string;
  externalTransactionId: string;
  externalRefundId: string;
  currency: string;
  amountMicros: string;
  amountRefundedMicros: string;
  creditAmount: string;
  providerEventOccurredAt: string;
  reason: string;
  evidenceReference: string;
}>;

const EMPTY_CORRECTION: CorrectionForm = {
  providerAccountId: "",
  providerEventId: "",
  externalTransactionId: "",
  externalRefundId: "",
  currency: "USD",
  amountMicros: "",
  amountRefundedMicros: "",
  creditAmount: "",
  providerEventOccurredAt: "",
  reason: "",
  evidenceReference: "",
};

export function PaymentCorrectionPanel(
  props: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void }>,
) {
  const { t } = useTranslation("commerce");
  const [form, setForm] = useState<CorrectionForm>(EMPTY_CORRECTION);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const attempt = useRef<IdempotencyAttempt | null>(null);

  const update = (field: keyof CorrectionForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const amount = Number(form.amountMicros);
    const refunded = Number(form.amountRefundedMicros);
    const credits = Number(form.creditAmount);
    if (
      !form.providerAccountId.trim() ||
      !form.providerEventId.trim() ||
      !form.externalTransactionId.trim() ||
      !form.providerEventOccurredAt.trim() ||
      !form.reason.trim() ||
      !form.evidenceReference.trim() ||
      !Number.isSafeInteger(amount) ||
      amount <= 0 ||
      !Number.isSafeInteger(refunded) ||
      refunded < 0 ||
      refunded > amount ||
      !Number.isSafeInteger(credits) ||
      credits <= 0
    ) {
      setError(t("PAYMENT_CORRECTION_INVALID"));
      setResult(null);
      return;
    }
    const fingerprint = JSON.stringify({ ...form, amount, refunded, credits });
    const current = attempt.current?.fingerprint === fingerprint ? attempt.current : null;
    const next = current ?? { fingerprint, key: crypto.randomUUID() };
    attempt.current = next;
    setPending(true);
    setError(null);
    try {
      const response = await recordCommercePaymentCorrection({
        provider: "stripe",
        providerMode: "test",
        providerAccountId: form.providerAccountId.trim(),
        providerEventId: form.providerEventId.trim(),
        externalTransactionId: form.externalTransactionId.trim(),
        externalInvoiceId: null,
        externalRefundId: form.externalRefundId.trim() || null,
        transactionStatus: "succeeded",
        invoiceStatus: null,
        refundStatus: form.externalRefundId.trim() ? "succeeded" : null,
        currency: form.currency.trim().toUpperCase(),
        amountMicros: amount,
        amountRefundedMicros: refunded,
        creditAmount: credits,
        providerEventOccurredAt: form.providerEventOccurredAt,
        reason: form.reason.trim(),
        evidenceReference: form.evidenceReference.trim(),
        idempotencyKey: next.key,
      });
      setResult(
        t("PAYMENT_CORRECTION_RECORDED", {
          status: t(
            response.disposition === "applied"
              ? "PAYMENT_CORRECTION_APPLIED"
              : response.disposition === "replayed"
                ? "PAYMENT_CORRECTION_REPLAYED"
                : "PAYMENT_CORRECTION_RECONCILIATION_REQUIRED",
          ),
        }),
      );
      if (attempt.current === next) attempt.current = null;
    } catch {
      setError(t("PAYMENT_CORRECTION_ERROR"));
    } finally {
      setPending(false);
    }
  };

  return (
    <SettingDialog
      description={t("PAYMENT_CORRECTION_DESCRIPTION")}
      footer={
        <>
          <Button disabled={pending} onClick={() => props.onOpenChange(false)} variant="outline">
            {t("CANCEL")}
          </Button>
          <Button disabled={pending} form="payment-correction-form" type="submit">
            {pending ? t("PAYMENT_CORRECTION_SAVING") : t("SAVE")}
          </Button>
        </>
      }
      onOpenChange={(open) => !pending && props.onOpenChange(open)}
      open={props.open}
      title={t("PAYMENT_CORRECTION_TITLE")}
    >
      <form className="grid gap-4" id="payment-correction-form" onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(
            [
              ["providerAccountId", "PAYMENT_CORRECTION_ACCOUNT"],
              ["providerEventId", "PAYMENT_CORRECTION_EVENT"],
              ["externalTransactionId", "PAYMENT_CORRECTION_TRANSACTION"],
              ["externalRefundId", "PAYMENT_CORRECTION_REFUND"],
              ["currency", "PAYMENT_CORRECTION_CURRENCY"],
              ["amountMicros", "PAYMENT_CORRECTION_AMOUNT"],
              ["amountRefundedMicros", "PAYMENT_CORRECTION_REFUNDED"],
              ["creditAmount", "PAYMENT_CORRECTION_CREDITS"],
              ["providerEventOccurredAt", "PAYMENT_CORRECTION_OCCURRED_AT"],
            ] as const
          ).map(([field, label]) => (
            <label
              className="grid gap-1 text-sm"
              htmlFor={`payment-correction-${field}`}
              key={field}
            >
              <span>{t(label)}</span>
              <Input
                id={`payment-correction-${field}`}
                inputMode={
                  field.includes("Micros") || field === "creditAmount" ? "numeric" : undefined
                }
                onChange={(event) => update(field, event.target.value)}
                placeholder={t(label)}
                value={form[field]}
              />
            </label>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1 text-sm" htmlFor="payment-correction-reason">
            <span>{t("REASON")}</span>
            <Input
              id="payment-correction-reason"
              onChange={(event) => update("reason", event.target.value)}
              placeholder={t("PAYMENT_CORRECTION_REASON_PLACEHOLDER")}
              value={form.reason}
            />
          </label>
          <label className="grid gap-1 text-sm" htmlFor="payment-correction-evidence">
            <span>{t("EVIDENCE_REFERENCE")}</span>
            <Input
              id="payment-correction-evidence"
              onChange={(event) => update("evidenceReference", event.target.value)}
              placeholder={t("EVIDENCE_REFERENCE_DESCRIPTION")}
              value={form.evidenceReference}
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {result ? <p className="text-sm text-muted-foreground">{result}</p> : null}
        </div>
      </form>
    </SettingDialog>
  );
}
