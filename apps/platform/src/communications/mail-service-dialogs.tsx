import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type {
  MailProviderInfo,
  MailServiceOut,
  MailServiceUpdateRequest,
} from "@arclayer/platform-openapi";

import {
  disableMailService,
  recoverMailService,
  rotateMailServiceCredentials,
  switchMailProvider,
  testMailService,
  updateMailService,
  writeMailServiceCredentials,
} from "@/communications/communications-api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingDialog } from "@/components/setting-dialog";
import { SettingDialogField, SettingDialogFields } from "@/components/setting-dialog-field";

type DialogProps = Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted: (messageKey: string) => void;
  service: MailServiceOut;
}>;

type SmtpSecurity = "unchanged" | "starttls" | "ssl_tls" | "none";
type IdempotencyAttempt = Readonly<{ fingerprint: string; key: string }>;

async function mutationFingerprint(input: unknown): Promise<string> {
  const serialized = JSON.stringify(input);
  if (serialized === undefined) throw new Error("MAIL_MUTATION_INPUT_NOT_SERIALIZABLE");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(serialized));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function idempotencyAttemptFor(
  current: IdempotencyAttempt | null,
  fingerprint: string,
): IdempotencyAttempt {
  return current?.fingerprint === fingerprint ? current : { fingerprint, key: crypto.randomUUID() };
}

function MutationError() {
  const { t } = useTranslation("communications");
  return (
    <Alert variant="destructive">
      <AlertTitle>{t("OPERATION_FAILED")}</AlertTitle>
      <AlertDescription>{t("OPERATION_FAILED")}</AlertDescription>
    </Alert>
  );
}

export function MailServiceProfileDialog(props: DialogProps) {
  const { t } = useTranslation("communications");
  const [senderAddress, setSenderAddress] = useState("");
  const [senderName, setSenderName] = useState("");
  const [senderDomain, setSenderDomain] = useState("");
  const [smtpServer, setSmtpServer] = useState("");
  const [smtpPort, setSmtpPort] = useState("");
  const [smtpSecurity, setSmtpSecurity] = useState<SmtpSecurity>("unchanged");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const profileAttempt = useRef<IdempotencyAttempt | null>(null);

  useEffect(() => {
    if (!props.open) return;
    setSenderAddress(props.service.sender.address ?? "");
    setSenderName(props.service.sender.name ?? "");
    setSenderDomain(props.service.sender.domain ?? "");
    setSmtpServer("");
    setSmtpPort("");
    setSmtpSecurity("unchanged");
    setPending(false);
    setError(false);
  }, [props.open, props.service]);

  const hasChanges = Boolean(
    (senderAddress.trim() && senderAddress.trim() !== props.service.sender.address) ||
    (senderName.trim() && senderName.trim() !== props.service.sender.name) ||
    (senderDomain.trim() && senderDomain.trim() !== props.service.sender.domain) ||
    (props.service.provider === "smtp" &&
      (smtpServer.trim() || smtpPort || smtpSecurity !== "unchanged")),
  );

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!hasChanges) return;
    const payload: Omit<MailServiceUpdateRequest, "idempotencyKey"> = {
      expectedRevision: props.service.revision,
    };
    const address = senderAddress.trim();
    const name = senderName.trim();
    const domain = senderDomain.trim();
    if (address && address !== props.service.sender.address) payload.senderAddress = address;
    if (name && name !== props.service.sender.name) payload.senderName = name;
    if (domain && domain !== props.service.sender.domain) payload.senderDomain = domain;
    if (props.service.provider === "smtp") {
      const smtp: NonNullable<MailServiceUpdateRequest["smtp"]> = {};
      if (smtpServer.trim()) smtp.server = smtpServer.trim();
      if (smtpPort) smtp.port = Number(smtpPort);
      if (smtpSecurity !== "unchanged") {
        smtp.starttls = smtpSecurity === "starttls";
        smtp.sslTls = smtpSecurity === "ssl_tls";
      }
      if (Object.keys(smtp).length) payload.smtp = smtp;
    }
    setPending(true);
    setError(false);
    try {
      const fingerprint = await mutationFingerprint({
        operation: "profile",
        payload,
        provider: props.service.provider,
      });
      const attempt = idempotencyAttemptFor(profileAttempt.current, fingerprint);
      profileAttempt.current = attempt;
      await updateMailService({ ...payload, idempotencyKey: attempt.key });
      if (profileAttempt.current === attempt) profileAttempt.current = null;
      props.onCompleted("OPERATION_ACCEPTED");
      props.onOpenChange(false);
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={(open) => !pending && props.onOpenChange(open)}
      title={t("EDIT_MAIL_SERVICE")}
      description={t("EDIT_MAIL_SERVICE_DESCRIPTION")}
      footer={
        <>
          <Button disabled={pending} onClick={() => props.onOpenChange(false)} variant="outline">
            {t("CANCEL")}
          </Button>
          <Button
            disabled={pending || !hasChanges}
            form="mail-service-profile"
            loading={pending}
            type="submit"
          >
            {t("SAVE_MAIL_SERVICE")}
          </Button>
        </>
      }
    >
      <form id="mail-service-profile" onSubmit={submit}>
        <SettingDialogFields>
          {error ? <MutationError /> : null}
          <SettingDialogField title={<label htmlFor="mail-provider">{t("PROVIDER")}</label>}>
            <Input disabled id="mail-provider" value={props.service.provider} />
          </SettingDialogField>
          <SettingDialogField
            title={<label htmlFor="mail-sender-address">{t("SENDER_ADDRESS")}</label>}
          >
            <Input
              id="mail-sender-address"
              onChange={(event) => setSenderAddress(event.target.value)}
              required
              type="email"
              value={senderAddress}
            />
          </SettingDialogField>
          <SettingDialogField title={<label htmlFor="mail-sender-name">{t("SENDER_NAME")}</label>}>
            <Input
              id="mail-sender-name"
              maxLength={160}
              onChange={(event) => setSenderName(event.target.value)}
              value={senderName}
            />
          </SettingDialogField>
          <SettingDialogField
            title={<label htmlFor="mail-sender-domain">{t("SENDER_DOMAIN")}</label>}
          >
            <Input
              id="mail-sender-domain"
              onChange={(event) => setSenderDomain(event.target.value)}
              value={senderDomain}
            />
          </SettingDialogField>
          {props.service.provider === "smtp" ? (
            <>
              <SettingDialogField
                title={<label htmlFor="mail-smtp-server">{t("SMTP_SERVER")}</label>}
                description={t("SMTP_ROUTE_DESCRIPTION")}
              >
                <Input
                  id="mail-smtp-server"
                  onChange={(event) => setSmtpServer(event.target.value)}
                  value={smtpServer}
                />
              </SettingDialogField>
              <SettingDialogField title={<label htmlFor="mail-smtp-port">{t("SMTP_PORT")}</label>}>
                <Input
                  id="mail-smtp-port"
                  max={65535}
                  min={1}
                  onChange={(event) => setSmtpPort(event.target.value)}
                  type="number"
                  value={smtpPort}
                />
              </SettingDialogField>
              <SettingDialogField title={t("SMTP_SECURITY")}>
                <Select
                  value={smtpSecurity}
                  onValueChange={(value) => setSmtpSecurity(value as SmtpSecurity)}
                >
                  <SelectTrigger aria-label={t("SMTP_SECURITY")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["unchanged", "starttls", "ssl_tls", "none"] as const).map((value) => (
                      <SelectItem key={value} value={value}>
                        {t(`SMTP_SECURITY_${value.toUpperCase()}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </SettingDialogField>
            </>
          ) : null}
        </SettingDialogFields>
      </form>
    </SettingDialog>
  );
}

export function MailCredentialDialog(props: DialogProps & Readonly<{ rotate: boolean }>) {
  const { t } = useTranslation("communications");
  const [username, setUsername] = useState("");
  const [secret, setSecret] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const credentialAttempt = useRef<IdempotencyAttempt | null>(null);

  useEffect(() => {
    if (!props.open) return;
    setUsername("");
    setSecret("");
    setPending(false);
    setError(false);
  }, [props.open]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(false);
    const payload = {
      expectedRevision: props.service.revision,
      secret,
      username: username.trim() || null,
    };
    try {
      const fingerprint = await mutationFingerprint({
        operation: props.rotate ? "credentials:rotate" : "credentials:write",
        payload,
        provider: props.service.provider,
      });
      const attempt = idempotencyAttemptFor(credentialAttempt.current, fingerprint);
      credentialAttempt.current = attempt;
      const body = { ...payload, idempotencyKey: attempt.key };
      if (props.rotate) await rotateMailServiceCredentials(body);
      else await writeMailServiceCredentials(body);
      if (credentialAttempt.current === attempt) credentialAttempt.current = null;
      setSecret("");
      props.onCompleted("OPERATION_ACCEPTED");
      props.onOpenChange(false);
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={(open) => !pending && props.onOpenChange(open)}
      title={t(props.rotate ? "ROTATE_CREDENTIALS" : "CONFIGURE_CREDENTIALS")}
      description={t(
        props.rotate ? "ROTATE_CREDENTIALS_DESCRIPTION" : "CONFIGURE_CREDENTIALS_DESCRIPTION",
      )}
      footer={
        <>
          <Button disabled={pending} onClick={() => props.onOpenChange(false)} variant="outline">
            {t("CANCEL")}
          </Button>
          <Button
            disabled={pending}
            form="mail-service-credentials"
            loading={pending}
            type="submit"
          >
            {t(props.rotate ? "ROTATE_CREDENTIALS" : "SAVE_CREDENTIALS")}
          </Button>
        </>
      }
    >
      <form id="mail-service-credentials" onSubmit={submit}>
        <SettingDialogFields>
          {error ? <MutationError /> : null}
          <SettingDialogField
            title={<label htmlFor="mail-credential-username">{t("CREDENTIAL_USERNAME")}</label>}
          >
            <Input
              autoComplete="off"
              id="mail-credential-username"
              onChange={(event) => setUsername(event.target.value)}
              value={username}
            />
          </SettingDialogField>
          <SettingDialogField
            title={<label htmlFor="mail-credential-secret">{t("CREDENTIAL_SECRET")}</label>}
            description={t("CREDENTIAL_SECRET_WRITE_ONLY")}
          >
            <Input
              autoComplete="new-password"
              id="mail-credential-secret"
              onChange={(event) => setSecret(event.target.value)}
              required
              type="password"
              value={secret}
            />
          </SettingDialogField>
        </SettingDialogFields>
      </form>
    </SettingDialog>
  );
}

export function MailServiceTestDialog(props: DialogProps) {
  const { t } = useTranslation("communications");
  const [recipient, setRecipient] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const testAttempt = useRef<IdempotencyAttempt | null>(null);

  useEffect(() => {
    if (!props.open) return;
    setRecipient("");
    setPending(false);
    setError(false);
  }, [props.open]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(false);
    try {
      const payload = {
        expectedRevision: props.service.revision,
        recipient: recipient.trim(),
      };
      const fingerprint = await mutationFingerprint({
        operation: "test",
        payload,
        provider: props.service.provider,
      });
      const attempt = idempotencyAttemptFor(testAttempt.current, fingerprint);
      testAttempt.current = attempt;
      await testMailService({ ...payload, idempotencyKey: attempt.key });
      if (testAttempt.current === attempt) testAttempt.current = null;
      props.onCompleted("OPERATION_ACCEPTED");
      props.onOpenChange(false);
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={(open) => !pending && props.onOpenChange(open)}
      title={t("TEST_MAIL_SERVICE_TITLE")}
      description={t("TEST_MAIL_SERVICE_DESCRIPTION")}
      footer={
        <>
          <Button disabled={pending} onClick={() => props.onOpenChange(false)} variant="outline">
            {t("CANCEL")}
          </Button>
          <Button disabled={pending} form="mail-service-test" loading={pending} type="submit">
            {t("RUN_TEST")}
          </Button>
        </>
      }
    >
      <form id="mail-service-test" onSubmit={submit}>
        <SettingDialogFields>
          {error ? <MutationError /> : null}
          <SettingDialogField
            title={<label htmlFor="mail-test-recipient">{t("TEST_RECIPIENT")}</label>}
          >
            <Input
              autoComplete="email"
              id="mail-test-recipient"
              onChange={(event) => setRecipient(event.target.value)}
              required
              type="email"
              value={recipient}
            />
          </SettingDialogField>
        </SettingDialogFields>
      </form>
    </SettingDialog>
  );
}

type ActionKind = "switch" | "disable" | "recover";

export function MailServiceActionDialog(
  props: DialogProps & Readonly<{ kind: ActionKind; provider?: MailProviderInfo }>,
) {
  const { t } = useTranslation("communications");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const actionAttempt = useRef<IdempotencyAttempt | null>(null);
  const keyPrefix =
    props.kind === "switch"
      ? "SWITCH_PROVIDER"
      : props.kind === "disable"
        ? "DISABLE_MAIL_SERVICE"
        : "RECOVER_MAIL_SERVICE";

  useEffect(() => {
    if (!props.open) return;
    setPending(false);
    setError(false);
  }, [props.open]);

  const confirm = async () => {
    setPending(true);
    setError(false);
    try {
      if (props.kind === "switch") {
        if (!props.provider) throw new Error("MAIL_PROVIDER_REQUIRED");
        await switchMailProvider(props.provider.providerId);
      } else {
        const payload = {
          expectedRevision: props.service.revision,
        };
        const fingerprint = await mutationFingerprint({
          operation: props.kind,
          payload,
          provider: props.service.provider,
        });
        const attempt = idempotencyAttemptFor(actionAttempt.current, fingerprint);
        actionAttempt.current = attempt;
        const body = { ...payload, idempotencyKey: attempt.key };
        if (props.kind === "disable") await disableMailService(body);
        else await recoverMailService(body);
        if (actionAttempt.current === attempt) actionAttempt.current = null;
      }
      props.onCompleted("OPERATION_ACCEPTED");
      props.onOpenChange(false);
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={(open) => !pending && props.onOpenChange(open)}
      title={t(`${keyPrefix}_TITLE`)}
      description={t(`${keyPrefix}_DESCRIPTION`, { provider: props.provider?.label })}
      footer={
        <>
          <Button disabled={pending} onClick={() => props.onOpenChange(false)} variant="outline">
            {t("CANCEL")}
          </Button>
          <Button
            disabled={pending}
            loading={pending}
            onClick={() => void confirm()}
            variant={props.kind === "disable" ? "destructive" : "default"}
          >
            {t(`CONFIRM_${keyPrefix}`)}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? <MutationError /> : null}
        {props.kind !== "recover" ? (
          <p className="text-sm text-muted-foreground">{t(`${keyPrefix}_CONSEQUENCE`)}</p>
        ) : null}
      </div>
    </SettingDialog>
  );
}
