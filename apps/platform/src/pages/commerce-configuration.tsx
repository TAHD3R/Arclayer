import { Pencil } from "lucide-react";
import { useCallback, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type { BillingProviderMode, DunningPolicyOut } from "@arclayer/platform-openapi";

import {
  getCommerceDunningPolicy,
  getCommerceProvider,
  putCommerceDunningPolicy,
} from "@/commerce/commerce-api";
import { CommercePage, CommerceQueryState } from "@/commerce/commerce-ui";
import { useMonitoringQuery } from "@/monitoring/monitoring-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingDialog } from "@/components/setting-dialog";
import { SettingDialogField, SettingDialogFields } from "@/components/setting-dialog-field";
import { Textarea } from "@/components/ui/textarea";

type IdempotencyAttempt = Readonly<{ fingerprint: string; key: string }>;

export function CommerceConfigurationPage() {
  const { t } = useTranslation("commerce");
  const [editPolicy, setEditPolicy] = useState(false);
  const [success, setSuccess] = useState(false);
  const load = useCallback(
    async () => ({
      dunning: await getCommerceDunningPolicy(),
      provider: await getCommerceProvider(),
    }),
    [],
  );
  const { state, retry } = useMonitoringQuery(load, []);
  return (
    <CommercePage description={t("CONFIGURATION_DESCRIPTION")} title={t("CONFIGURATION_TITLE")}>
      <CommerceQueryState isEmpty={() => false} retry={retry} state={state}>
        {({ dunning, provider }) => (
          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{provider.provider}</CardTitle>
                <CardDescription>{t("PROVIDER_READINESS_DESCRIPTION")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Badge variant={provider.configured ? "secondary" : "outline"}>
                    {provider.configured ? t("CONFIGURED") : t("NOT_CONFIGURED")}
                  </Badge>
                  <Badge variant={provider.webhookReady ? "secondary" : "outline"}>
                    {provider.webhookReady ? t("WEBHOOK_READY") : t("WEBHOOK_NOT_READY")}
                  </Badge>
                  <Badge variant={provider.connectorRegistered ? "secondary" : "outline"}>
                    {provider.connectorRegistered
                      ? t("CONNECTOR_REGISTERED")
                      : t("CONNECTOR_NOT_REGISTERED")}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm font-medium">{t("SUPPORTED_CAPABILITIES")}</p>
                  <p className="text-sm text-muted-foreground">
                    {provider.supportedCapabilities.join(", ") || t("NONE")}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium">{t("MISSING_PREREQUISITES")}</p>
                  <p className="text-sm text-muted-foreground">
                    {provider.missingPrerequisites.join(", ") || t("NONE")}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t("CONFIGURATION_WRITE_UNAVAILABLE")}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>{t("PAYMENT_RECOVERY_TITLE")}</CardTitle>
                    <CardDescription>{t("PAYMENT_RECOVERY_DESCRIPTION")}</CardDescription>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setEditPolicy(true)}>
                    <Pencil aria-hidden="true" />
                    {t("EDIT")}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <Badge variant={dunning.isActive ? "secondary" : "outline"}>
                  {dunning.isActive ? t("ACTIVE") : t("INACTIVE")}
                </Badge>
                <p className="text-sm text-muted-foreground">
                  {t("PAYMENT_RECOVERY_PROVIDER", {
                    mode: t(`PROVIDER_MODE_${dunning.providerMode.toUpperCase()}`),
                    provider: dunning.provider,
                  })}
                </p>
                {success ? <p className="text-sm">{t("PAYMENT_RECOVERY_UPDATED")}</p> : null}
              </CardContent>
            </Card>
            {editPolicy ? (
              <DunningPolicyDialog
                open
                onCompleted={() => {
                  setSuccess(true);
                  retry();
                }}
                onOpenChange={setEditPolicy}
                policy={dunning}
              />
            ) : null}
          </div>
        )}
      </CommerceQueryState>
    </CommercePage>
  );
}

function DunningPolicyDialog({
  onCompleted,
  onOpenChange,
  open,
  policy,
}: Readonly<{
  onCompleted: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  policy: DunningPolicyOut;
}>) {
  const { t } = useTranslation("commerce");
  const [mode, setMode] = useState<BillingProviderMode>(policy.providerMode);
  const [policyText, setPolicyText] = useState(() => JSON.stringify(policy.policy, null, 2));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveAttempt = useRef<IdempotencyAttempt | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(policyText) as Record<string, unknown>;
    } catch {
      setError(t("PAYMENT_RECOVERY_JSON_INVALID"));
      return;
    }
    const fingerprint = JSON.stringify([policy.provider, policy.revision, mode, parsed]);
    const attempt =
      saveAttempt.current?.fingerprint === fingerprint
        ? saveAttempt.current
        : { fingerprint, key: crypto.randomUUID() };
    saveAttempt.current = attempt;
    setPending(true);
    setError(null);
    try {
      await putCommerceDunningPolicy({
        expectedRevision: policy.revision,
        idempotencyKey: attempt.key,
        policy: parsed,
        provider: policy.provider,
        providerMode: mode,
      });
      if (saveAttempt.current === attempt) saveAttempt.current = null;
      onCompleted();
      onOpenChange(false);
    } catch {
      setError(t("ACTION_ERROR"));
    } finally {
      setPending(false);
    }
  };
  return (
    <SettingDialog
      open={open}
      onOpenChange={(nextOpen) => !pending && onOpenChange(nextOpen)}
      title={t("EDIT_PAYMENT_RECOVERY")}
      description={t("EDIT_PAYMENT_RECOVERY_DESCRIPTION")}
      footer={
        <>
          <Button disabled={pending} variant="outline" onClick={() => onOpenChange(false)}>
            {t("CANCEL")}
          </Button>
          <Button disabled={pending} form="commerce-dunning-policy" type="submit">
            {pending ? t("SAVING") : t("SAVE")}
          </Button>
        </>
      }
    >
      <form id="commerce-dunning-policy" onSubmit={submit}>
        <SettingDialogFields>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <SettingDialogField title={t("PROVIDER_MODE")}>
            <Select value={mode} onValueChange={(value) => setMode(value as BillingProviderMode)}>
              <SelectTrigger aria-label={t("PROVIDER_MODE")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="test">{t("PROVIDER_MODE_TEST")}</SelectItem>
                <SelectItem value="live">{t("PROVIDER_MODE_LIVE")}</SelectItem>
              </SelectContent>
            </Select>
          </SettingDialogField>
          <SettingDialogField
            title={<label htmlFor="payment-recovery-policy">{t("PAYMENT_RECOVERY_RULES")}</label>}
            description={t("PAYMENT_RECOVERY_RULES_DESCRIPTION")}
          >
            <Textarea
              id="payment-recovery-policy"
              rows={14}
              value={policyText}
              onChange={(event) => setPolicyText(event.target.value)}
            />
          </SettingDialogField>
        </SettingDialogFields>
      </form>
    </SettingDialog>
  );
}
