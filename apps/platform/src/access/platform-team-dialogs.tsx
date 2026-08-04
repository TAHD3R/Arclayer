import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type {
  PlatformInvitationCandidateOut,
  PlatformInvitationDetailOut,
  PlatformRoleCatalogItemOut,
  PlatformSessionInventoryItemOut,
  PlatformTeamOperatorOut,
} from "@arclayer/platform-openapi";

import {
  invitePlatformOperator,
  getPlatformInvitationOptions,
  listPlatformOperatorSessions,
  offboardPlatformOperator,
  PlatformAccessApiError,
  replacePlatformOperatorRoles,
  resetPlatformOperatorMfa,
  revokePlatformInvitation,
  revokePlatformOperatorSession,
} from "@/access/access-api";
import { verifyPlatformAction } from "@/access/platform-step-up";
import { useMonitoringQuery } from "@/monitoring/monitoring-ui";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingDialog } from "@/components/setting-dialog";
import { SettingDialogField, SettingDialogFields } from "@/components/setting-dialog-field";
import { SettingDrawer } from "@/components/setting-drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/monitoring/format";

const DAY_MS = 24 * 60 * 60 * 1000;

type MutationAttempt = Readonly<{
  correlationId: string;
  fingerprint: string;
  idempotencyKey: string;
}>;

type InvitationAttempt = MutationAttempt &
  Readonly<{
    expiresAt: string;
    invitationId: string;
  }>;

type StepUpAttempt = MutationAttempt & Readonly<{ stepUpProof?: string }>;

function createMutationAttempt(fingerprint: string): MutationAttempt {
  return {
    correlationId: crypto.randomUUID(),
    fingerprint,
    idempotencyKey: crypto.randomUUID(),
  };
}

type DialogBaseProps = Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted: (messageKey: string) => void;
}>;

function errorKey(error: unknown): string {
  if (!(error instanceof PlatformAccessApiError)) return "ACTION_ERROR";
  if (error.message === "PLATFORM_WEBAUTHN_CANCELLED") return "SECURITY_KEY_CANCELLED";
  if (error.message === "PLATFORM_WEBAUTHN_UNAVAILABLE") return "SECURITY_KEY_UNAVAILABLE";
  if (error.status === 401 || error.status === 403) return "ACTION_PERMISSION_ERROR";
  if (error.status === 409) return "ACTION_CONFLICT_ERROR";
  if (error.status === 422) return "ACTION_VALIDATION_ERROR";
  return "ACTION_ERROR";
}

function MutationError({ message }: { message: string }) {
  const { t } = useTranslation("access");
  return (
    <Alert variant="destructive">
      <AlertTitle>{t("ACTION_FAILED")}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

function userLabel(user: PlatformInvitationCandidateOut): string {
  return user.displayName?.trim() || user.username;
}

export function InviteOperatorDialog(props: DialogBaseProps) {
  const { t } = useTranslation("access");
  const [query, setQuery] = useState("");
  const [userId, setUserId] = useState("");
  const [roleIds, setRoleIds] = useState<ReadonlySet<string>>(new Set());
  const [expiryDays, setExpiryDays] = useState("7");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inviteAttempt = useRef<InvitationAttempt | null>(null);
  const loadUsers = useCallback(() => getPlatformInvitationOptions(query.trim() || null), [query]);
  const { state: usersState } = useMonitoringQuery(loadUsers, [query]);
  const candidates = usersState.status === "ready" ? usersState.data.candidates : [];
  const roles = usersState.status === "ready" ? usersState.data.roles : [];

  useEffect(() => {
    if (props.open) return;
    setQuery("");
    setUserId("");
    setRoleIds(new Set());
    setExpiryDays("7");
    setError(null);
    inviteAttempt.current = null;
  }, [props.open]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const selectedRoles = roles.filter((role) => roleIds.has(role.roleId));
    if (!userId || selectedRoles.length === 0) {
      setError("INVITE_REQUIRED_FIELDS");
      return;
    }
    const intendedRoles = selectedRoles.map((role) => ({
      roleId: role.roleId,
      roleRevisionId: role.revisionId,
      permissionCodes: role.permissionCodes,
    }));
    const fingerprint = JSON.stringify([userId, expiryDays, intendedRoles]);
    const attempt =
      inviteAttempt.current?.fingerprint === fingerprint
        ? inviteAttempt.current
        : {
            ...createMutationAttempt(fingerprint),
            expiresAt: new Date(Date.now() + Number(expiryDays) * DAY_MS).toISOString(),
            invitationId: crypto.randomUUID(),
          };
    inviteAttempt.current = attempt;
    setPending(true);
    setError(null);
    try {
      await invitePlatformOperator({
        invitationId: attempt.invitationId,
        recipientUserId: userId,
        intendedRoles,
        expiresAt: attempt.expiresAt,
        idempotencyKey: attempt.idempotencyKey,
        correlationId: attempt.correlationId,
      });
      if (inviteAttempt.current === attempt) inviteAttempt.current = null;
      props.onCompleted("OPERATOR_INVITED");
      props.onOpenChange(false);
    } catch (caught) {
      setError(errorKey(caught));
    } finally {
      setPending(false);
    }
  };

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={(open) => !pending && props.onOpenChange(open)}
      title={t("INVITE_OPERATOR")}
      description={t("INVITE_OPERATOR_DESCRIPTION")}
      footer={
        <>
          <Button disabled={pending} variant="outline" onClick={() => props.onOpenChange(false)}>
            {t("CANCEL")}
          </Button>
          <Button
            disabled={pending || !userId || roleIds.size === 0}
            form="invite-platform-operator"
            type="submit"
          >
            {pending ? t("SENDING") : t("SEND_INVITATION")}
          </Button>
        </>
      }
    >
      <form id="invite-platform-operator" onSubmit={submit}>
        <SettingDialogFields>
          {error ? <MutationError message={t(error)} /> : null}
          {usersState.status === "error" ? (
            <MutationError message={t("PERSON_SEARCH_ERROR")} />
          ) : null}
          <SettingDialogField
            title={<label htmlFor="operator-search">{t("PERSON")}</label>}
            description={t("PERSON_SEARCH_HELP")}
          >
            <Input
              id="operator-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("PERSON_SEARCH_PLACEHOLDER")}
            />
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger className="mt-2" aria-label={t("PERSON")}>
                <SelectValue
                  placeholder={usersState.status === "loading" ? t("LOADING") : t("CHOOSE_PERSON")}
                />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((candidate) => (
                  <SelectItem key={candidate.userId} value={candidate.userId}>
                    {userLabel(candidate)} · {candidate.username}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingDialogField>
          <SettingDialogField title={t("ROLES")} description={t("INVITE_ROLES_HELP")}>
            <div className="space-y-2 rounded-lg border p-3">
              {roles.map((role) => (
                <label key={role.roleId} className="flex items-start gap-3">
                  <Checkbox
                    checked={roleIds.has(role.roleId)}
                    onCheckedChange={(checked) =>
                      setRoleIds((current) => {
                        const next = new Set(current);
                        if (checked) next.add(role.roleId);
                        else next.delete(role.roleId);
                        return next;
                      })
                    }
                  />
                  <span>
                    <span className="block text-sm font-medium">{role.name}</span>
                    {role.description ? (
                      <span className="block text-xs text-muted-foreground">
                        {role.description}
                      </span>
                    ) : null}
                  </span>
                </label>
              ))}
            </div>
          </SettingDialogField>
          <SettingDialogField title={t("INVITATION_VALID_FOR")}>
            <Select value={expiryDays} onValueChange={setExpiryDays}>
              <SelectTrigger aria-label={t("INVITATION_VALID_FOR")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">{t("SEVEN_DAYS")}</SelectItem>
                <SelectItem value="30">{t("THIRTY_DAYS")}</SelectItem>
              </SelectContent>
            </Select>
          </SettingDialogField>
        </SettingDialogFields>
      </form>
    </SettingDialog>
  );
}

type OperatorDialogProps = DialogBaseProps &
  Readonly<{
    operator: PlatformTeamOperatorOut;
    roles: readonly PlatformRoleCatalogItemOut[];
  }>;

export function ManageOperatorRolesDialog(props: OperatorDialogProps) {
  const { t } = useTranslation("access");
  const initialRoleIds = useMemo(
    () => props.operator.roles.map((role) => role.roleId).sort(),
    [props.operator.roles],
  );
  const [roleIds, setRoleIds] = useState<ReadonlySet<string>>(() => new Set(initialRoleIds));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const assignmentAttempt = useRef<StepUpAttempt | null>(null);

  useEffect(() => {
    if (props.open) return;
    setRoleIds(new Set(initialRoleIds));
    setError(null);
    assignmentAttempt.current = null;
  }, [initialRoleIds, props.open]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const selectedRoleIds = [...roleIds].sort();
    if (JSON.stringify(selectedRoleIds) === JSON.stringify(initialRoleIds)) return;
    const fingerprint = JSON.stringify([
      props.operator.user.userId,
      props.operator.revision,
      selectedRoleIds,
    ]);
    let attempt: StepUpAttempt =
      assignmentAttempt.current?.fingerprint === fingerprint
        ? assignmentAttempt.current
        : createMutationAttempt(fingerprint);
    assignmentAttempt.current = attempt;
    const scope = {
      expected_operator_revision: props.operator.revision,
      role_ids: selectedRoleIds,
    };
    setPending(true);
    setError(null);
    try {
      if (!attempt.stepUpProof) {
        const stepUpProof = await verifyPlatformAction({
          actionCode: "platform.access.change_role",
          idempotencyKey: attempt.idempotencyKey,
          scope,
          targetId: props.operator.user.userId,
          targetType: "platform_operator",
        });
        attempt = { ...attempt, stepUpProof };
        assignmentAttempt.current = attempt;
      }
      const stepUpProof = attempt.stepUpProof;
      if (!stepUpProof) throw new Error("PLATFORM_STEP_UP_PROOF_REQUIRED");
      await replacePlatformOperatorRoles(props.operator.user.userId, {
        correlationId: attempt.correlationId,
        expectedOperatorRevision: props.operator.revision,
        idempotencyKey: attempt.idempotencyKey,
        roleIds: selectedRoleIds,
        stepUpProof,
      });
      if (assignmentAttempt.current === attempt) assignmentAttempt.current = null;
      props.onCompleted("ROLES_UPDATED");
      props.onOpenChange(false);
    } catch (caught) {
      setError(errorKey(caught));
    } finally {
      setPending(false);
    }
  };

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={(open) => !pending && props.onOpenChange(open)}
      title={t("MANAGE_ROLES")}
      description={t("MANAGE_ROLES_DESCRIPTION", {
        name: userLabel(props.operator.user),
      })}
      footer={
        <>
          <Button disabled={pending} variant="outline" onClick={() => props.onOpenChange(false)}>
            {t("CANCEL")}
          </Button>
          <Button
            disabled={
              pending || JSON.stringify([...roleIds].sort()) === JSON.stringify(initialRoleIds)
            }
            form="assign-platform-operator-roles"
            type="submit"
          >
            {pending ? t("VERIFYING") : t("VERIFY_AND_SAVE_ROLES")}
          </Button>
        </>
      }
    >
      <form id="assign-platform-operator-roles" onSubmit={submit}>
        <SettingDialogFields>
          {error ? <MutationError message={t(error)} /> : null}
          <SettingDialogField title={t("ROLES")} description={t("MANAGE_ROLES_HELP")}>
            {props.roles.length ? (
              <div className="space-y-2 rounded-lg border p-3">
                {props.roles.map((role) => (
                  <label key={role.roleId} className="flex items-start gap-3">
                    <Checkbox
                      checked={roleIds.has(role.roleId)}
                      onCheckedChange={(checked) =>
                        setRoleIds((current) => {
                          const next = new Set(current);
                          if (checked) next.add(role.roleId);
                          else next.delete(role.roleId);
                          return next;
                        })
                      }
                    />
                    <span>
                      <span className="block text-sm font-medium">{role.name}</span>
                      {role.description ? (
                        <span className="block text-xs text-muted-foreground">
                          {role.description}
                        </span>
                      ) : null}
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("NO_ROLES_AVAILABLE")}</p>
            )}
          </SettingDialogField>
          <p className="text-sm text-muted-foreground">{t("SECURITY_KEY_REQUIRED")}</p>
        </SettingDialogFields>
      </form>
    </SettingDialog>
  );
}

type OperatorSecurityDialogProps = DialogBaseProps &
  Readonly<{ operator: PlatformTeamOperatorOut }>;

export function OperatorSessionsDrawer(
  props: OperatorSecurityDialogProps & Readonly<{ canRevoke: boolean }>,
) {
  const { t } = useTranslation("access");
  const load = useCallback(
    () => listPlatformOperatorSessions(props.operator.operatorId),
    [props.operator.operatorId],
  );
  const { retry, state } = useMonitoringQuery(load, [props.operator.operatorId, props.open]);
  const [selected, setSelected] = useState<PlatformSessionInventoryItemOut | null>(null);

  return (
    <>
      <SettingDrawer
        description={t("OPERATOR_SESSIONS_DESCRIPTION", {
          name: userLabel(props.operator.user),
        })}
        footer={
          <Button onClick={() => props.onOpenChange(false)} variant="outline">
            {t("CLOSE")}
          </Button>
        }
        onOpenChange={props.onOpenChange}
        open={props.open}
        title={t("OPERATOR_SESSIONS_TITLE")}
      >
        {state.status === "loading" ? (
          <div aria-label={t("LOADING")} className="space-y-3" role="status">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : state.status === "error" ? (
          <div className="space-y-3">
            <MutationError message={t(errorKey(state.error))} />
            <Button onClick={retry} variant="outline">
              {t("RETRY")}
            </Button>
          </div>
        ) : state.data.length ? (
          <div className="space-y-3">
            {state.data.map((session) => (
              <article className="rounded-lg border p-4" key={session.sessionId}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{session.deviceLabel ?? t("UNRECOGNIZED_DEVICE")}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t("LAST_ACTIVE", { date: formatDateTime(session.recentActivityAt) })}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {t("EXPIRES", { date: formatDateTime(session.absoluteExpiresAt) })}
                    </p>
                  </div>
                  {props.canRevoke ? (
                    <Button onClick={() => setSelected(session)} size="sm" variant="outline">
                      {t("REVOKE_SESSION")}
                    </Button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="rounded-lg border p-5 text-sm text-muted-foreground">
            {t("OPERATOR_SESSIONS_EMPTY")}
          </p>
        )}
      </SettingDrawer>
      {selected ? (
        <RevokeOperatorSessionDialog
          onCompleted={(messageKey) => {
            props.onCompleted(messageKey);
            retry();
          }}
          onOpenChange={(open) => !open && setSelected(null)}
          open
          operator={props.operator}
          session={selected}
        />
      ) : null}
    </>
  );
}

function RevokeOperatorSessionDialog(
  props: OperatorSecurityDialogProps & Readonly<{ session: PlatformSessionInventoryItemOut }>,
) {
  const { t } = useTranslation("access");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<MutationAttempt | null>(null);

  const revoke = async () => {
    const fingerprint = JSON.stringify([props.operator.operatorId, props.session.sessionId]);
    const attempt =
      request.current?.fingerprint === fingerprint
        ? request.current
        : createMutationAttempt(fingerprint);
    request.current = attempt;
    setPending(true);
    setError(null);
    try {
      await revokePlatformOperatorSession(props.operator.operatorId, props.session.sessionId, {
        correlationId: attempt.correlationId,
        idempotencyKey: attempt.idempotencyKey,
      });
      request.current = null;
      props.onCompleted("OPERATOR_SESSION_REVOKED");
      props.onOpenChange(false);
    } catch (caught) {
      setError(errorKey(caught));
    } finally {
      setPending(false);
    }
  };

  return (
    <SettingDialog
      description={t("REVOKE_OPERATOR_SESSION_DESCRIPTION", {
        device: props.session.deviceLabel ?? t("UNRECOGNIZED_DEVICE"),
        name: userLabel(props.operator.user),
      })}
      footer={
        <>
          <Button disabled={pending} onClick={() => props.onOpenChange(false)} variant="outline">
            {t("CANCEL")}
          </Button>
          <Button loading={pending} onClick={() => void revoke()} variant="destructive">
            {t("CONFIRM_SESSION_REVOKE")}
          </Button>
        </>
      }
      onOpenChange={(open) => !pending && props.onOpenChange(open)}
      open={props.open}
      title={t("REVOKE_OPERATOR_SESSION_TITLE")}
    >
      {error ? <MutationError message={t(error)} /> : null}
      <p className="text-sm text-muted-foreground">{t("REVOKE_OPERATOR_SESSION_CONSEQUENCE")}</p>
    </SettingDialog>
  );
}

export function ResetOperatorMfaDialog(props: OperatorSecurityDialogProps) {
  const { t } = useTranslation("access");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<StepUpAttempt | null>(null);

  const reset = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedReason = reason.trim();
    if (!trimmedReason) return;
    const fingerprint = JSON.stringify([
      props.operator.operatorId,
      props.operator.revision,
      trimmedReason,
    ]);
    let attempt: StepUpAttempt =
      request.current?.fingerprint === fingerprint
        ? request.current
        : createMutationAttempt(fingerprint);
    request.current = attempt;
    const scope = {
      expected_operator_revision: props.operator.revision,
      reason: trimmedReason,
    };
    setPending(true);
    setError(null);
    try {
      if (!attempt.stepUpProof) {
        const stepUpProof = await verifyPlatformAction({
          actionCode: "platform.access.reset_operator_mfa",
          idempotencyKey: attempt.idempotencyKey,
          scope,
          targetId: props.operator.operatorId,
          targetType: "platform_operator",
        });
        attempt = { ...attempt, stepUpProof };
        request.current = attempt;
      }
      if (!attempt.stepUpProof) throw new Error("PLATFORM_STEP_UP_PROOF_REQUIRED");
      await resetPlatformOperatorMfa(props.operator.operatorId, {
        correlationId: attempt.correlationId,
        expectedOperatorRevision: props.operator.revision,
        idempotencyKey: attempt.idempotencyKey,
        reason: trimmedReason,
        stepUpProof: attempt.stepUpProof,
      });
      request.current = null;
      props.onCompleted("OPERATOR_MFA_RESET");
      props.onOpenChange(false);
    } catch (caught) {
      setError(errorKey(caught));
    } finally {
      setPending(false);
    }
  };

  return (
    <SettingDialog
      description={t("RESET_OPERATOR_MFA_DESCRIPTION", {
        name: userLabel(props.operator.user),
      })}
      footer={
        <>
          <Button disabled={pending} onClick={() => props.onOpenChange(false)} variant="outline">
            {t("CANCEL")}
          </Button>
          <Button
            disabled={pending || !reason.trim()}
            form="reset-platform-operator-mfa"
            type="submit"
            variant="destructive"
          >
            {pending ? t("VERIFYING") : t("VERIFY_AND_RESET_MFA")}
          </Button>
        </>
      }
      onOpenChange={(open) => !pending && props.onOpenChange(open)}
      open={props.open}
      title={t("RESET_OPERATOR_MFA_TITLE")}
    >
      <form id="reset-platform-operator-mfa" onSubmit={reset}>
        <SettingDialogFields>
          {error ? <MutationError message={t(error)} /> : null}
          <Alert>
            <AlertTitle>{t("RESET_OPERATOR_MFA_IMPACT_TITLE")}</AlertTitle>
            <AlertDescription>
              {t("RESET_OPERATOR_MFA_IMPACT", {
                methodCount: props.operator.mfa.verifiedMethodCount,
                sessionCount: props.operator.sessions.activeSessionCount,
              })}
            </AlertDescription>
          </Alert>
          <SettingDialogField
            description={t("RESET_OPERATOR_MFA_REASON_HELP")}
            title={<label htmlFor="operator-mfa-reset-reason">{t("REASON")}</label>}
          >
            <Textarea
              id="operator-mfa-reset-reason"
              onChange={(event) => setReason(event.target.value)}
              value={reason}
            />
          </SettingDialogField>
          <p className="text-sm text-muted-foreground">{t("RESET_OPERATOR_MFA_CONSEQUENCE")}</p>
        </SettingDialogFields>
      </form>
    </SettingDialog>
  );
}

export function OffboardOperatorDialog(props: OperatorDialogProps) {
  const { t } = useTranslation("access");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<StepUpAttempt | null>(null);

  useEffect(() => {
    if (props.open) return;
    setReason("");
    setError(null);
    request.current = null;
  }, [props.open]);

  const offboard = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedReason = reason.trim();
    if (!trimmedReason) return;
    const fingerprint = JSON.stringify([
      props.operator.user.userId,
      props.operator.revision,
      trimmedReason,
    ]);
    let attempt: StepUpAttempt =
      request.current?.fingerprint === fingerprint
        ? request.current
        : createMutationAttempt(fingerprint);
    request.current = attempt;
    setPending(true);
    setError(null);
    try {
      const scope = {
        expected_operator_revision: props.operator.revision,
        reason: trimmedReason,
      };
      if (!attempt.stepUpProof) {
        const stepUpProof = await verifyPlatformAction({
          actionCode: "platform.access.remove_operator",
          idempotencyKey: attempt.idempotencyKey,
          scope,
          targetId: props.operator.user.userId,
          targetType: "platform_operator",
        });
        attempt = { ...attempt, stepUpProof };
        request.current = attempt;
      }
      const stepUpProof = attempt.stepUpProof;
      if (!stepUpProof) throw new Error("PLATFORM_STEP_UP_PROOF_REQUIRED");
      await offboardPlatformOperator(props.operator.user.userId, {
        correlationId: attempt.correlationId,
        expectedOperatorRevision: props.operator.revision,
        idempotencyKey: attempt.idempotencyKey,
        reason: trimmedReason,
        stepUpProof,
      });
      if (request.current === attempt) request.current = null;
      props.onCompleted("OPERATOR_ACCESS_REMOVED");
      props.onOpenChange(false);
    } catch (caught) {
      setError(errorKey(caught));
    } finally {
      setPending(false);
    }
  };

  return (
    <SettingDialog
      description={t("REMOVE_OPERATOR_DESCRIPTION", { name: userLabel(props.operator.user) })}
      footer={
        <>
          <Button disabled={pending} onClick={() => props.onOpenChange(false)} variant="outline">
            {t("CANCEL")}
          </Button>
          <Button
            disabled={pending || !reason.trim()}
            form="offboard-platform-operator"
            type="submit"
            variant="destructive"
          >
            {pending ? t("REMOVING_ACCESS") : t("CONFIRM_REMOVE_OPERATOR")}
          </Button>
        </>
      }
      onOpenChange={(open) => !pending && props.onOpenChange(open)}
      open={props.open}
      title={t("REMOVE_OPERATOR_TITLE")}
    >
      <form id="offboard-platform-operator" onSubmit={offboard}>
        <SettingDialogFields>
          {error ? <MutationError message={t(error)} /> : null}
          <Alert>
            <AlertTitle>{t("REMOVE_OPERATOR_IMPACT_TITLE")}</AlertTitle>
            <AlertDescription>
              {t("REMOVE_OPERATOR_IMPACT", {
                roleCount: props.operator.roles.length,
                sessionCount: props.operator.sessions.activeSessionCount,
              })}
            </AlertDescription>
          </Alert>
          <SettingDialogField
            description={t("REMOVE_OPERATOR_REASON_HELP")}
            title={<label htmlFor="offboard-reason">{t("REMOVE_OPERATOR_REASON")}</label>}
          >
            <Textarea
              id="offboard-reason"
              onChange={(event) => setReason(event.target.value)}
              value={reason}
            />
          </SettingDialogField>
          <p className="text-sm text-muted-foreground">{t("REMOVE_OPERATOR_CONSEQUENCE")}</p>
        </SettingDialogFields>
      </form>
    </SettingDialog>
  );
}

type InvitationDialogProps = DialogBaseProps &
  Readonly<{ invitation: PlatformInvitationDetailOut }>;

export function RevokeInvitationDialog(props: InvitationDialogProps) {
  const { t } = useTranslation("access");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const revokeAttempt = useRef<MutationAttempt | null>(null);

  useEffect(() => {
    if (props.open) return;
    setError(null);
    revokeAttempt.current = null;
  }, [props.open]);

  const revoke = async () => {
    const fingerprint = JSON.stringify([props.invitation.invitationId, props.invitation.revision]);
    const attempt =
      revokeAttempt.current?.fingerprint === fingerprint
        ? revokeAttempt.current
        : createMutationAttempt(fingerprint);
    revokeAttempt.current = attempt;
    setPending(true);
    setError(null);
    try {
      await revokePlatformInvitation(props.invitation.invitationId, {
        correlationId: attempt.correlationId,
        expectedInvitationRevision: props.invitation.revision,
        idempotencyKey: attempt.idempotencyKey,
      });
      if (revokeAttempt.current === attempt) revokeAttempt.current = null;
      props.onCompleted("INVITATION_REVOKED_MESSAGE");
      props.onOpenChange(false);
    } catch (caught) {
      setError(errorKey(caught));
    } finally {
      setPending(false);
    }
  };

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={(open) => !pending && props.onOpenChange(open)}
      title={t("REVOKE_INVITATION_TITLE")}
      description={t("REVOKE_INVITATION_DESCRIPTION", {
        name: userLabel(props.invitation.recipient),
      })}
      footer={
        <>
          <Button disabled={pending} variant="outline" onClick={() => props.onOpenChange(false)}>
            {t("CANCEL")}
          </Button>
          <Button disabled={pending} variant="destructive" onClick={revoke}>
            {pending ? t("REVOKING") : t("CONFIRM_REVOKE_INVITATION")}
          </Button>
        </>
      }
    >
      {error ? <MutationError message={t(error)} /> : null}
      <p className="text-sm text-muted-foreground">{t("REVOKE_INVITATION_CONSEQUENCE")}</p>
    </SettingDialog>
  );
}
