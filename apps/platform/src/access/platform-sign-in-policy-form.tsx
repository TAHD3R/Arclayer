import { useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type { PlatformSignInSettingsOut } from "@arclayer/platform-openapi";
import { toast } from "sonner";

import { updateSignInPolicy } from "@/access/access-api";
import { signInSettingsErrorKey } from "@/access/platform-sign-in-errors";
import { verifyPlatformAction } from "@/access/platform-step-up";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

type MutationAttempt = Readonly<{
  correlationId: string;
  fingerprint: string;
  idempotencyKey: string;
  stepUpProof?: string;
}>;

export const PLATFORM_SIGN_IN_POLICY_FORM_ID = "platform-sign-in-policy-form";

export function PlatformSignInPolicyForm({
  settings,
  canManage,
  onChanged,
  onPendingChange,
}: Readonly<{
  settings: PlatformSignInSettingsOut;
  canManage: boolean;
  onChanged: (settings: PlatformSignInSettingsOut) => void;
  onPendingChange: (pending: boolean) => void;
}>) {
  const { t } = useTranslation("access");
  const [publicRegistration, setPublicRegistration] = useState(
    settings.registration.publicRegistrationEnabled,
  );
  const [requireEmail, setRequireEmail] = useState(settings.registration.requireEmail);
  const [requireEmailVerification, setRequireEmailVerification] = useState(
    settings.registration.requireEmailVerification,
  );
  const [domains, setDomains] = useState(settings.registration.emailDomainsAllowlist.join("\n"));
  const [autoProvision, setAutoProvision] = useState(settings.provisioning.autoProvisionEnabled);
  const [autoAcceptInvites, setAutoAcceptInvites] = useState(
    settings.provisioning.autoAcceptEmailInvites,
  );
  const [pending, setPending] = useState(false);
  const attemptRef = useRef<MutationAttempt | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const emailDomainsAllowlist = domains
      .split(/[\n,]/u)
      .map((value) => value.trim())
      .filter(Boolean);
    const fingerprint = JSON.stringify([
      settings.revision,
      publicRegistration,
      requireEmail,
      requireEmailVerification,
      emailDomainsAllowlist,
      autoProvision,
      autoAcceptInvites,
    ]);
    let attempt = attemptRef.current;
    if (!attempt || attempt.fingerprint !== fingerprint) {
      attempt = {
        correlationId: crypto.randomUUID(),
        fingerprint,
        idempotencyKey: crypto.randomUUID(),
      };
      attemptRef.current = attempt;
    }
    setPending(true);
    onPendingChange(true);
    try {
      if (!attempt.stepUpProof) {
        attempt = {
          ...attempt,
          stepUpProof: await verifyPlatformAction({
            actionCode: "platform.access.change_sign_in_settings",
            expectedRevision: settings.revision,
            idempotencyKey: attempt.idempotencyKey,
            scope: { operation: "update_policy" },
            targetType: "platform_sign_in_settings",
          }),
        };
        attemptRef.current = attempt;
      }
      if (!attempt.stepUpProof) throw new Error("PLATFORM_STEP_UP_PROOF_REQUIRED");
      const updatedSettings = await updateSignInPolicy({
        autoAcceptEmailInvites: autoAcceptInvites,
        autoProvisionEnabled: autoProvision,
        correlationId: attempt.correlationId,
        emailDomainsAllowlist,
        expectedRevision: settings.revision,
        idempotencyKey: attempt.idempotencyKey,
        publicRegistrationEnabled: publicRegistration,
        requireEmail,
        requireEmailVerification,
        stepUpProof: attempt.stepUpProof,
      });
      attemptRef.current = null;
      toast.success(t("SIGN_IN_SETTINGS_SAVED"));
      onChanged(updatedSettings);
    } catch (caught) {
      toast.error(t("ACTION_FAILED"), {
        description: t(signInSettingsErrorKey(caught, "SIGN_IN_SETTINGS_SAVE_ERROR")),
      });
    } finally {
      setPending(false);
      onPendingChange(false);
    }
  };

  const setEmailRequired = (checked: boolean) => {
    setRequireEmail(checked);
    if (!checked) {
      setRequireEmailVerification(false);
      setDomains("");
    }
  };

  return (
    <form className="space-y-4" id={PLATFORM_SIGN_IN_POLICY_FORM_ID} onSubmit={submit}>
      {!canManage ? (
        <Alert>
          <AlertTitle>{t("READ_ONLY_TITLE")}</AlertTitle>
          <AlertDescription>{t("SIGN_IN_SETTINGS_READ_ONLY_DESCRIPTION")}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("REGISTRATION_TITLE")}</CardTitle>
            <CardDescription>{t("REGISTRATION_CONFIGURATION_DESCRIPTION")}</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <BooleanField
                checked={publicRegistration}
                description={t("PUBLIC_REGISTRATION_DESCRIPTION")}
                disabled={!canManage || pending}
                label={t("PUBLIC_REGISTRATION")}
                onCheckedChange={setPublicRegistration}
              />
              <BooleanField
                checked={requireEmail}
                description={t("REQUIRE_EMAIL_DESCRIPTION")}
                disabled={!canManage || pending}
                label={t("REQUIRE_EMAIL")}
                onCheckedChange={setEmailRequired}
              />
              <BooleanField
                checked={requireEmailVerification}
                description={t("REQUIRE_EMAIL_VERIFICATION_DESCRIPTION")}
                disabled={!canManage || pending || !requireEmail}
                label={t("REQUIRE_EMAIL_VERIFICATION")}
                onCheckedChange={setRequireEmailVerification}
              />
              <Field>
                <FieldLabel htmlFor="platform-registration-domains">
                  {t("ALLOWED_DOMAINS")}
                </FieldLabel>
                <FieldDescription>{t("ALLOWED_DOMAINS_DESCRIPTION")}</FieldDescription>
                <Textarea
                  disabled={!canManage || pending || !requireEmail}
                  id="platform-registration-domains"
                  placeholder={t("ALLOWED_DOMAINS_PLACEHOLDER")}
                  rows={5}
                  value={domains}
                  onChange={(event) => setDomains(event.target.value)}
                />
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("ACCOUNT_PROVISIONING_TITLE")}</CardTitle>
            <CardDescription>{t("ACCOUNT_PROVISIONING_DESCRIPTION")}</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <BooleanField
                checked={autoProvision}
                description={t("AUTO_PROVISION_DESCRIPTION")}
                disabled={!canManage || pending}
                label={t("AUTO_PROVISION")}
                onCheckedChange={setAutoProvision}
              />
              <BooleanField
                checked={autoAcceptInvites}
                description={t("AUTO_ACCEPT_INVITES_DESCRIPTION")}
                disabled={!canManage || pending}
                label={t("AUTO_ACCEPT_INVITES")}
                onCheckedChange={setAutoAcceptInvites}
              />
            </FieldGroup>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}

function BooleanField({
  checked,
  description,
  disabled,
  label,
  onCheckedChange,
}: Readonly<{
  checked: boolean;
  description: string;
  disabled: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}>) {
  return (
    <Field orientation="horizontal">
      <FieldContent>
        <FieldTitle>{label}</FieldTitle>
        <FieldDescription>{description}</FieldDescription>
      </FieldContent>
      <Checkbox
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
    </Field>
  );
}
