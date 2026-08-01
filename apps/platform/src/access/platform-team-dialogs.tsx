import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type { PlatformInvitationCandidateOut } from "@arclayer/platform-openapi";

import {
  invitePlatformOperator,
  getPlatformInvitationOptions,
  PlatformAccessApiError,
} from "@/access/access-api";
import { useMonitoringQuery } from "@/monitoring/monitoring-ui";
import { Alert, AlertDescription, AlertTitle } from "@arclayer/ui/alert";
import { Button } from "@arclayer/ui/button";
import { Checkbox } from "@arclayer/ui/checkbox";
import { Input } from "@arclayer/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { SettingDialogField, SettingDialogFields } from "@arclayer/ui/setting-dialog-field";

const DAY_MS = 24 * 60 * 60 * 1000;

type DialogBaseProps = Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted: (messageKey: string) => void;
}>;

function errorKey(error: unknown): string {
  if (!(error instanceof PlatformAccessApiError)) return "ACTION_ERROR";
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
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
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
    setIdempotencyKey(crypto.randomUUID());
  }, [props.open]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const selectedRoles = roles.filter((role) => roleIds.has(role.roleId));
    if (!userId || selectedRoles.length === 0) {
      setError("INVITE_REQUIRED_FIELDS");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await invitePlatformOperator({
        invitationId: crypto.randomUUID(),
        recipientUserId: userId,
        intendedRoles: selectedRoles.map((role) => ({
          roleId: role.roleId,
          roleRevisionId: role.revisionId,
          permissionCodes: role.permissionCodes,
        })),
        expiresAt: new Date(Date.now() + Number(expiryDays) * DAY_MS).toISOString(),
        idempotencyKey,
        correlationId: crypto.randomUUID(),
      });
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
                    <span className="block text-footnote font-medium">{role.name}</span>
                    {role.description ? (
                      <span className="block text-caption text-label-secondary">
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
