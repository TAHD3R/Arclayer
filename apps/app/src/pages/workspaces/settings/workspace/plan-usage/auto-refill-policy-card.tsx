import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { WorkspaceAutoRefillPolicy, WorkspaceAutoRefillPolicyCommand } from "@/api/commerce";
import { Alert, AlertDescription, AlertTitle } from "@arclayer/ui/alert";
import { Button } from "@arclayer/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@arclayer/ui/card";
import { Input } from "@arclayer/ui/input";

type AutoRefillInput = Omit<WorkspaceAutoRefillPolicyCommand, "idempotencyKey">;

export function AutoRefillPolicyCard(props: {
  policy: WorkspaceAutoRefillPolicy;
  pending: boolean;
  feedback: "idle" | "saved" | "error";
  onEdit: () => void;
  onSave: (input: AutoRefillInput) => Promise<void>;
}) {
  const { t, i18n } = useTranslation(["commerce"]);
  const [offerId, setOfferId] = useState(props.policy.offerId ?? "");
  const [triggerBelowCredits, setTriggerBelowCredits] = useState(
    String(props.policy.triggerBelowCredits ?? 0),
  );
  const [monthlyCeiling, setMonthlyCeiling] = useState(
    props.policy.monthlyCeilingMicros == null
      ? ""
      : String(props.policy.monthlyCeilingMicros / 1_000_000),
  );

  useEffect(() => {
    setOfferId(props.policy.offerId ?? props.policy.availableOffers?.[0]?.offerId ?? "");
    setTriggerBelowCredits(String(props.policy.triggerBelowCredits ?? 0));
    setMonthlyCeiling(
      props.policy.monthlyCeilingMicros == null
        ? ""
        : String(props.policy.monthlyCeilingMicros / 1_000_000),
    );
  }, [props.policy]);

  const selectedOffer = useMemo(
    () => (props.policy.availableOffers ?? []).find((offer) => offer.offerId === offerId),
    [offerId, props.policy.availableOffers],
  );
  const availableOffers = props.policy.availableOffers ?? [];
  const currency = selectedOffer?.currency ?? props.policy.currency ?? "USD";
  const unavailable =
    props.policy.executionState === "unavailable" || props.policy.provider == null;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!offerId || !selectedOffer) return;
    const trigger = Number.parseInt(triggerBelowCredits, 10);
    const ceiling = Number.parseFloat(monthlyCeiling);
    if (!Number.isSafeInteger(trigger) || trigger < 0 || !Number.isFinite(ceiling) || ceiling <= 0)
      return;
    await props.onSave({
      offerId,
      isEnabled: false,
      triggerBelowCredits: trigger,
      monthlyCeilingMicros: Math.round(ceiling * 1_000_000),
      currency,
      expectedRevision: props.policy.revision,
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("commerce:AUTO_REFILL_TITLE")}</CardTitle>
        <CardDescription>{t("commerce:AUTO_REFILL_DESCRIPTION")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <Alert>
          <AlertTitle>{t("commerce:AUTO_REFILL_UNAVAILABLE_TITLE")}</AlertTitle>
          <AlertDescription>{t("commerce:AUTO_REFILL_UNAVAILABLE_DESCRIPTION")}</AlertDescription>
        </Alert>
        <form className="grid gap-4 sm:grid-cols-3" onSubmit={submit}>
          <label className="grid gap-2 text-footnote text-label-secondary">
            <span>{t("commerce:AUTO_REFILL_OFFER_LABEL")}</span>
            <select
              className="h-9 rounded-md border border-border bg-background px-3 text-label-primary"
              value={offerId}
              onChange={(event) => {
                setOfferId(event.target.value);
                props.onEdit();
              }}
              disabled={props.pending || availableOffers.length === 0}
            >
              <option value="">{t("commerce:AUTO_REFILL_OFFER_EMPTY")}</option>
              {availableOffers.map((offer) => (
                <option key={offer.offerId} value={offer.offerId}>
                  {offer.offerCode} · {offer.creditAmount}{" "}
                  {t("commerce:AUTO_REFILL_CREDITS_SUFFIX")} ·{" "}
                  {(offer.amountMicros / 1_000_000).toLocaleString(
                    i18n.resolvedLanguage ?? i18n.language,
                    {
                      style: "currency",
                      currency: offer.currency,
                    },
                  )}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-footnote text-label-secondary">
            <span>{t("commerce:AUTO_REFILL_TRIGGER_LABEL")}</span>
            <Input
              min={0}
              type="number"
              value={triggerBelowCredits}
              onChange={(event) => setTriggerBelowCredits(event.target.value)}
              disabled={props.pending}
            />
          </label>
          <label className="grid gap-2 text-footnote text-label-secondary">
            <span>{t("commerce:AUTO_REFILL_CEILING_LABEL", { currency })}</span>
            <Input
              min={0}
              step="0.01"
              type="number"
              value={monthlyCeiling}
              onChange={(event) => setMonthlyCeiling(event.target.value)}
              disabled={props.pending}
            />
          </label>
          <div className="sm:col-span-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-caption text-label-secondary">
              {unavailable
                ? t("commerce:AUTO_REFILL_STATUS_UNAVAILABLE")
                : t("commerce:AUTO_REFILL_STATUS_DISABLED")}
            </p>
            <Button type="submit" loading={props.pending} disabled={unavailable || !selectedOffer}>
              {t("commerce:AUTO_REFILL_SAVE")}
            </Button>
          </div>
          {props.feedback === "saved" ? (
            <p className="sm:col-span-3 text-caption text-label-secondary">
              {t("commerce:AUTO_REFILL_SAVED")}
            </p>
          ) : props.feedback === "error" ? (
            <p className="sm:col-span-3 text-caption text-destructive">
              {t("commerce:AUTO_REFILL_SAVE_ERROR")}
            </p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
