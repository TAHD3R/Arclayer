import { useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type {
  AccessRestrictionAdminOut,
  AccessRestrictionEnforceRequest,
  AccessRestrictionLiftRequest,
  AccessRestrictionReasonCategory,
  DirectoryWorkspaceDetailOut,
} from "@arclayer/platform-openapi";

import {
  archiveTenantWorkspace,
  disableTenantWorkspace,
  enableTenantWorkspace,
  restoreTenantWorkspace,
  TenantDirectoryApiError,
  updateTenantWorkspace,
} from "@/api/tenant-directory";
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
import { SettingDialogField, SettingDialogFields } from "@/components/setting-dialog-field";
import { SettingDialog } from "@/components/setting-dialog";
import { Textarea } from "@/components/ui/textarea";

export type WorkspaceAccessAction = "disable" | "enable" | "archive" | "restore";
type IdempotencyAttempt = Readonly<{ fingerprint: string; key: string }>;

type DialogProps = Readonly<{
  workspace: DirectoryWorkspaceDetailOut;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (workspace: DirectoryWorkspaceDetailOut, messageKey: string) => void;
}>;

function mutationErrorKey(error: unknown): string {
  if (!(error instanceof TenantDirectoryApiError)) return "ACTION_ERROR";
  if (error.status === 401 || error.status === 403) return "ACTION_PERMISSION_ERROR";
  if (error.status === 409) return "ACTION_CONFLICT_ERROR";
  if (error.status === 422) return "ACTION_VALIDATION_ERROR";
  if (error.code === "TENANT_DIRECTORY_NETWORK_ERROR") return "ACTION_NETWORK_ERROR";
  return "ACTION_ERROR";
}

export function EditWorkspaceDialog(props: DialogProps) {
  const { t } = useTranslation("tenants");
  const [name, setName] = useState(props.workspace.name);
  const [description, setDescription] = useState(props.workspace.description ?? "");
  const [pending, setPending] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedName = name.trim();
    if (!normalizedName) {
      setErrorKey("WORKSPACE_NAME_REQUIRED");
      return;
    }
    setPending(true);
    setErrorKey(null);
    try {
      const workspace = await updateTenantWorkspace(props.workspace.workspaceId, {
        name: normalizedName,
        description: description.trim() || null,
      });
      props.onSaved(workspace, "WORKSPACE_UPDATED");
      props.onOpenChange(false);
    } catch (error) {
      setErrorKey(mutationErrorKey(error));
    } finally {
      setPending(false);
    }
  };

  return (
    <SettingDialog
      description={t("EDIT_WORKSPACE_DESCRIPTION")}
      footer={
        <>
          <Button disabled={pending} onClick={() => props.onOpenChange(false)} variant="outline">
            {t("CANCEL")}
          </Button>
          <Button disabled={pending || !name.trim()} form="edit-workspace-form" type="submit">
            {pending ? t("SAVING") : t("SAVE_CHANGES")}
          </Button>
        </>
      }
      onOpenChange={(open) => !pending && props.onOpenChange(open)}
      open={props.open}
      title={t("EDIT_WORKSPACE")}
    >
      <form id="edit-workspace-form" onSubmit={submit}>
        <SettingDialogFields>
          {errorKey ? <MutationError message={t(errorKey)} /> : null}
          <SettingDialogField title={<label htmlFor="workspace-name">{t("NAME")}</label>}>
            <Input
              autoComplete="off"
              id="workspace-name"
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
          </SettingDialogField>
          <SettingDialogField
            description={t("DESCRIPTION_FIELD_HELP")}
            title={<label htmlFor="workspace-description">{t("DESCRIPTION")}</label>}
          >
            <Textarea
              id="workspace-description"
              maxLength={500}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              value={description}
            />
          </SettingDialogField>
        </SettingDialogFields>
      </form>
    </SettingDialog>
  );
}

const REASON_CATEGORIES: readonly AccessRestrictionReasonCategory[] = [
  "security_risk",
  "policy_violation",
  "billing_issue",
  "abuse_prevention",
  "compliance_review",
  "owner_request",
  "other",
];

function activeRestriction(
  workspace: DirectoryWorkspaceDetailOut,
  action: WorkspaceAccessAction,
): AccessRestrictionAdminOut | null {
  const type = action === "enable" ? "workspace_suspended" : "workspace_archived";
  return (
    workspace.restrictions?.find(
      (restriction) => restriction.restrictionType === type && restriction.state === "active",
    ) ?? null
  );
}

export function WorkspaceAccessDialog(props: DialogProps & { action: WorkspaceAccessAction }) {
  const { t } = useTranslation("tenants");
  const restriction = activeRestriction(props.workspace, props.action);
  const lifting = props.action === "enable" || props.action === "restore";
  const [reasonCategory, setReasonCategory] =
    useState<AccessRestrictionReasonCategory>("security_risk");
  const [reasonCode, setReasonCode] = useState("");
  const [operatorNote, setOperatorNote] = useState("");
  const [reviewAt, setReviewAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [pending, setPending] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const accessAttempt = useRef<IdempotencyAttempt | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!operatorNote.trim() || (!lifting && !reasonCode.trim())) {
      setErrorKey("REASON_FIELDS_REQUIRED");
      return;
    }
    if (lifting && !restriction) {
      setErrorKey("RESTRICTION_CHANGED");
      return;
    }
    const request: AccessRestrictionEnforceRequest | AccessRestrictionLiftRequest = lifting
      ? {
          expectedRevision: restriction!.revision,
          operatorNote: operatorNote.trim(),
        }
      : {
          expectedRevision: restriction?.revision ?? 0,
          reasonCategory,
          reasonCode: reasonCode.trim(),
          operatorNote: operatorNote.trim(),
          reviewAt: reviewAt ? new Date(reviewAt).toISOString() : null,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        };
    const fingerprint = JSON.stringify([props.workspace.workspaceId, props.action, request]);
    const attempt =
      accessAttempt.current?.fingerprint === fingerprint
        ? accessAttempt.current
        : { fingerprint, key: globalThis.crypto.randomUUID() };
    accessAttempt.current = attempt;
    setPending(true);
    setErrorKey(null);
    try {
      const workspace = lifting
        ? await runLift(
            props.action,
            props.workspace.workspaceId,
            request as AccessRestrictionLiftRequest,
            attempt.key,
          )
        : await runEnforcement(
            props.action,
            props.workspace.workspaceId,
            request as AccessRestrictionEnforceRequest,
            attempt.key,
          );
      if (accessAttempt.current === attempt) accessAttempt.current = null;
      props.onSaved(workspace, `WORKSPACE_${props.action.toUpperCase()}D`);
      props.onOpenChange(false);
    } catch (error) {
      setErrorKey(mutationErrorKey(error));
    } finally {
      setPending(false);
    }
  };

  return (
    <SettingDialog
      description={t(`${props.action.toUpperCase()}_DESCRIPTION`, { name: props.workspace.name })}
      footer={
        <>
          <Button disabled={pending} onClick={() => props.onOpenChange(false)} variant="outline">
            {t("CANCEL")}
          </Button>
          <Button
            disabled={pending || !operatorNote.trim() || (!lifting && !reasonCode.trim())}
            form="workspace-access-form"
            type="submit"
            variant={lifting ? "default" : "destructive"}
          >
            {pending ? t("APPLYING") : t(`${props.action.toUpperCase()}_ACTION`)}
          </Button>
        </>
      }
      onOpenChange={(open) => !pending && props.onOpenChange(open)}
      open={props.open}
      title={t(`${props.action.toUpperCase()}_WORKSPACE`)}
    >
      <form id="workspace-access-form" onSubmit={submit}>
        <SettingDialogFields>
          {errorKey ? <MutationError message={t(errorKey)} /> : null}
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
                title={<label htmlFor="reason-reference">{t("REASON_REFERENCE")}</label>}
              >
                <Input
                  id="reason-reference"
                  maxLength={100}
                  onChange={(event) => setReasonCode(event.target.value)}
                  value={reasonCode}
                />
              </SettingDialogField>
            </>
          ) : null}
          <SettingDialogField
            description={t(lifting ? "RECOVERY_NOTE_HELP" : "OPERATOR_NOTE_HELP")}
            title={
              <label htmlFor="operator-note">
                {t(lifting ? "RECOVERY_NOTE" : "OPERATOR_NOTE")}
              </label>
            }
          >
            <Textarea
              id="operator-note"
              maxLength={1000}
              onChange={(event) => setOperatorNote(event.target.value)}
              rows={4}
              value={operatorNote}
            />
          </SettingDialogField>
          {!lifting ? (
            <div className="grid gap-5 sm:grid-cols-2">
              <SettingDialogField title={<label htmlFor="review-at">{t("REVIEW_AT")}</label>}>
                <Input
                  id="review-at"
                  onChange={(event) => setReviewAt(event.target.value)}
                  type="datetime-local"
                  value={reviewAt}
                />
              </SettingDialogField>
              <SettingDialogField title={<label htmlFor="expires-at">{t("EXPIRES_AT")}</label>}>
                <Input
                  id="expires-at"
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

async function runEnforcement(
  action: WorkspaceAccessAction,
  workspaceId: string,
  body: Parameters<typeof disableTenantWorkspace>[1],
  idempotencyKey: string,
) {
  if (action === "disable") return disableTenantWorkspace(workspaceId, body, idempotencyKey);
  if (action === "archive") return archiveTenantWorkspace(workspaceId, body, idempotencyKey);
  throw new Error(`Invalid enforcement action: ${action}`);
}

async function runLift(
  action: WorkspaceAccessAction,
  workspaceId: string,
  body: Parameters<typeof enableTenantWorkspace>[1],
  idempotencyKey: string,
) {
  if (action === "enable") return enableTenantWorkspace(workspaceId, body, idempotencyKey);
  if (action === "restore") return restoreTenantWorkspace(workspaceId, body, idempotencyKey);
  throw new Error(`Invalid lift action: ${action}`);
}

function MutationError(props: { message: string }) {
  const { t } = useTranslation("tenants");
  return (
    <Alert variant="destructive">
      <AlertTitle>{t("ACTION_FAILED")}</AlertTitle>
      <AlertDescription>{props.message}</AlertDescription>
    </Alert>
  );
}
