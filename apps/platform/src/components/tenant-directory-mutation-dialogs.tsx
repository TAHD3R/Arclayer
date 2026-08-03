import { useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type {
  AccessRestrictionAdminOut,
  AccessRestrictionEnforceRequest,
  AccessRestrictionLiftRequest,
  AccessRestrictionReasonCategory,
} from "@arclayer/platform-openapi";

import { TenantDirectoryApiError } from "@/api/tenant-directory";
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
import { Textarea } from "@/components/ui/textarea";

const REASON_CATEGORIES: readonly AccessRestrictionReasonCategory[] = [
  "security_risk",
  "policy_violation",
  "billing_issue",
  "abuse_prevention",
  "compliance_review",
  "owner_request",
  "other",
];
const REASON_CODE_PATTERN = /^[a-z][a-z0-9_]{2,63}$/;
const REASON_CODE_MAX_LENGTH = 64;
const OPERATOR_NOTE_MAX_LENGTH = 1000;

type Subject = "USER" | "PROJECT";
type AccessAction = "disable" | "enable";
type IdempotencyAttempt = Readonly<{ fingerprint: string; key: string }>;

type RestrictionDialogProps<T> = Readonly<{
  action: AccessAction;
  activeRestriction: AccessRestrictionAdminOut | null;
  onEnforce: (request: AccessRestrictionEnforceRequest, idempotencyKey: string) => Promise<T>;
  onLift: (request: AccessRestrictionLiftRequest, idempotencyKey: string) => Promise<T>;
  onOpenChange: (open: boolean) => void;
  onSaved: (item: T) => void;
  open: boolean;
  subject: Subject;
  subjectName: string;
}>;

export function TenantAccessRestrictionDialog<T>(props: RestrictionDialogProps<T>) {
  const { t } = useTranslation("tenants");
  const lifting = props.action === "enable";
  const [reasonCategory, setReasonCategory] =
    useState<AccessRestrictionReasonCategory>("security_risk");
  const [reasonCode, setReasonCode] = useState("");
  const [operatorNote, setOperatorNote] = useState("");
  const [reviewAt, setReviewAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [pending, setPending] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const restrictionAttempt = useRef<IdempotencyAttempt | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedReasonCode = reasonCode.trim();
    const normalizedNote = operatorNote.trim();
    const reviewAtIso = optionalIsoDate(reviewAt);
    const expiresAtIso = optionalIsoDate(expiresAt);
    if (!normalizedNote) {
      setErrorKey("REASON_FIELDS_REQUIRED");
      return;
    }
    if (!lifting && !REASON_CODE_PATTERN.test(normalizedReasonCode)) {
      setErrorKey("REASON_CODE_INVALID");
      return;
    }
    if ((reviewAt && !reviewAtIso) || (expiresAt && !expiresAtIso)) {
      setErrorKey("RESTRICTION_DATE_INVALID");
      return;
    }
    if (lifting && !props.activeRestriction) {
      setErrorKey("MANAGEMENT_RESTRICTION_CHANGED");
      return;
    }

    const request = lifting
      ? {
          expectedRevision: props.activeRestriction!.revision,
          operatorNote: normalizedNote,
        }
      : {
          expectedRevision: props.activeRestriction?.revision ?? 0,
          reasonCategory,
          reasonCode: normalizedReasonCode,
          operatorNote: normalizedNote,
          reviewAt: reviewAtIso,
          expiresAt: expiresAtIso,
        };
    const fingerprint = JSON.stringify([props.subject, props.subjectName, props.action, request]);
    const attempt =
      restrictionAttempt.current?.fingerprint === fingerprint
        ? restrictionAttempt.current
        : { fingerprint, key: globalThis.crypto.randomUUID() };
    restrictionAttempt.current = attempt;
    setPending(true);
    setErrorKey(null);
    try {
      const item = lifting
        ? await props.onLift(request as AccessRestrictionLiftRequest, attempt.key)
        : await props.onEnforce(request as AccessRestrictionEnforceRequest, attempt.key);
      if (restrictionAttempt.current === attempt) restrictionAttempt.current = null;
      props.onSaved(item);
      props.onOpenChange(false);
    } catch (error) {
      setErrorKey(directoryMutationErrorKey(error));
    } finally {
      setPending(false);
    }
  };

  const actionKey = props.action.toUpperCase();
  const subjectKey = `${actionKey}_${props.subject}`;
  return (
    <SettingDialog
      description={t(`${subjectKey}_DESCRIPTION`, { name: props.subjectName })}
      footer={
        <>
          <Button
            disabled={pending}
            onClick={() => props.onOpenChange(false)}
            type="button"
            variant="outline"
          >
            {t("CANCEL")}
          </Button>
          <Button
            disabled={pending || !operatorNote.trim() || (!lifting && !reasonCode.trim())}
            form="tenant-access-restriction"
            type="submit"
            variant={lifting ? "default" : "destructive"}
          >
            {pending ? t("APPLYING") : t(`${actionKey}_ACTION`)}
          </Button>
        </>
      }
      onOpenChange={(open) => !pending && props.onOpenChange(open)}
      open={props.open}
      title={t(subjectKey)}
    >
      <form id="tenant-access-restriction" onSubmit={submit}>
        <SettingDialogFields>
          {errorKey ? <TenantDirectoryMutationError errorKey={errorKey} /> : null}
          {!lifting ? (
            <>
              <SettingDialogField title={t("REASON_CATEGORY")}>
                <Select
                  onValueChange={(value) =>
                    setReasonCategory(value as AccessRestrictionReasonCategory)
                  }
                  value={reasonCategory}
                >
                  <SelectTrigger aria-label={t("REASON_CATEGORY")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REASON_CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>
                        {t(`REASON_${category.toUpperCase()}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </SettingDialogField>
              <SettingDialogField
                description={t("REASON_REFERENCE_HELP")}
                title={<label htmlFor="restriction-reason-code">{t("REASON_REFERENCE")}</label>}
              >
                <Input
                  autoComplete="off"
                  id="restriction-reason-code"
                  maxLength={REASON_CODE_MAX_LENGTH}
                  onChange={(event) => setReasonCode(event.target.value)}
                  value={reasonCode}
                />
              </SettingDialogField>
            </>
          ) : null}
          <SettingDialogField
            description={t(lifting ? "RECOVERY_NOTE_HELP" : "OPERATOR_NOTE_HELP")}
            title={
              <label htmlFor="restriction-operator-note">
                {t(lifting ? "RECOVERY_NOTE" : "OPERATOR_NOTE")}
              </label>
            }
          >
            <Textarea
              id="restriction-operator-note"
              maxLength={OPERATOR_NOTE_MAX_LENGTH}
              onChange={(event) => setOperatorNote(event.target.value)}
              rows={4}
              value={operatorNote}
            />
          </SettingDialogField>
          {!lifting ? (
            <div className="grid gap-5 sm:grid-cols-2">
              <SettingDialogField
                title={<label htmlFor="restriction-review-at">{t("REVIEW_AT")}</label>}
              >
                <Input
                  id="restriction-review-at"
                  onChange={(event) => setReviewAt(event.target.value)}
                  type="datetime-local"
                  value={reviewAt}
                />
              </SettingDialogField>
              <SettingDialogField
                title={<label htmlFor="restriction-expires-at">{t("EXPIRES_AT")}</label>}
              >
                <Input
                  id="restriction-expires-at"
                  onChange={(event) => setExpiresAt(event.target.value)}
                  type="datetime-local"
                  value={expiresAt}
                />
              </SettingDialogField>
            </div>
          ) : null}
        </SettingDialogFields>
      </form>
    </SettingDialog>
  );
}

export function TenantDirectoryMutationError(props: { errorKey: string }) {
  const { t } = useTranslation("tenants");
  return (
    <Alert variant="destructive">
      <AlertTitle>{t("ACTION_FAILED")}</AlertTitle>
      <AlertDescription>{t(props.errorKey)}</AlertDescription>
    </Alert>
  );
}

export function directoryMutationErrorKey(error: unknown): string {
  if (!(error instanceof TenantDirectoryApiError)) return "MANAGEMENT_ACTION_ERROR";
  if (error.status === 401 || error.status === 403) return "MANAGEMENT_PERMISSION_ERROR";
  if (error.status === 409) return "MANAGEMENT_CONFLICT_ERROR";
  if (error.status === 422) return "MANAGEMENT_VALIDATION_ERROR";
  if (error.code === "TENANT_DIRECTORY_NETWORK_ERROR") return "MANAGEMENT_NETWORK_ERROR";
  return "MANAGEMENT_ACTION_ERROR";
}

function optionalIsoDate(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}
