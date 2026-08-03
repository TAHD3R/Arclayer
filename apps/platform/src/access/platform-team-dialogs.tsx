import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type {
  PlatformInvitationCandidateOut,
  PlatformInvitationDetailOut,
  PlatformRoleCatalogItemOut,
  PlatformTeamOperatorOut,
} from "@arclayer/platform-openapi";

import {
  assignPlatformOperatorRoles,
  invitePlatformOperator,
  getPlatformInvitationOptions,
  PlatformAccessApiError,
  revokePlatformInvitation,
} from "@/access/access-api";
import { verifyPlatformAction } from "@/access/platform-step-up";
import { useMonitoringQuery } from "@/monitoring/monitoring-ui";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

type RoleAssignmentAttempt = MutationAttempt & Readonly<{ stepUpProof?: string }>;

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

export function AssignOperatorRolesDialog(props: OperatorDialogProps) {
  const { t } = useTranslation("access");
  const assigned = new Set(props.operator.roles.map((role) => role.roleId));
  const availableRoles = props.roles.filter((role) => !assigned.has(role.roleId));
  const [roleIds, setRoleIds] = useState<ReadonlySet<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const assignmentAttempt = useRef<RoleAssignmentAttempt | null>(null);

  useEffect(() => {
    if (props.open) return;
    setRoleIds(new Set());
    setError(null);
    assignmentAttempt.current = null;
  }, [props.open]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const selectedRoleIds = [...roleIds].sort();
    if (!selectedRoleIds.length) return;
    const fingerprint = JSON.stringify([
      props.operator.user.userId,
      props.operator.revision,
      selectedRoleIds,
    ]);
    let attempt: RoleAssignmentAttempt =
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
      await assignPlatformOperatorRoles(props.operator.user.userId, {
        correlationId: attempt.correlationId,
        expectedOperatorRevision: props.operator.revision,
        idempotencyKey: attempt.idempotencyKey,
        roleIds: selectedRoleIds,
        stepUpProof,
      });
      if (assignmentAttempt.current === attempt) assignmentAttempt.current = null;
      props.onCompleted("ROLES_ASSIGNED");
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
      title={t("ADD_ROLES")}
      description={t("ADD_ROLES_DESCRIPTION", {
        name: userLabel(props.operator.user),
      })}
      footer={
        <>
          <Button disabled={pending} variant="outline" onClick={() => props.onOpenChange(false)}>
            {t("CANCEL")}
          </Button>
          <Button
            disabled={pending || roleIds.size === 0}
            form="assign-platform-operator-roles"
            type="submit"
          >
            {pending ? t("VERIFYING") : t("VERIFY_AND_ADD_ROLES")}
          </Button>
        </>
      }
    >
      <form id="assign-platform-operator-roles" onSubmit={submit}>
        <SettingDialogFields>
          {error ? <MutationError message={t(error)} /> : null}
          <SettingDialogField title={t("ROLES")} description={t("ADD_ROLES_HELP")}>
            {availableRoles.length ? (
              <div className="space-y-2 rounded-lg border p-3">
                {availableRoles.map((role) => (
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
              <p className="text-sm text-muted-foreground">{t("NO_ASSIGNABLE_ROLES")}</p>
            )}
          </SettingDialogField>
          <p className="text-sm text-muted-foreground">{t("SECURITY_KEY_REQUIRED")}</p>
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
