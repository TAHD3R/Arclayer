import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import * as authApi from "@/api/auth";
import { useAdminDateTimeFormatter } from "@/hooks/use-admin-date-time-formatter";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import {
  AlertDialog,
  AlertDialogAction as AlertDialogActionPrimitive,
  AlertDialogCancel as AlertDialogCancelPrimitive,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@arclayer/ui/alert-dialog";
import { Button } from "@arclayer/ui/button";
import { SettingCard, SettingCardContent, SettingCardHeader } from "@arclayer/ui/setting-card";
import { Spinner } from "@arclayer/ui/spinner";

import { SecuritySessionsTableContent, type SessionRow } from "./security-sessions-table-view";

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;
const SESSION_PLACEHOLDER_VALUES = new Set(["-", "unknown", "n/a", "null", "undefined"]);

function normalizeSessionLabel(value: string | null | undefined): string | null {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  if (SESSION_PLACEHOLDER_VALUES.has(trimmed.toLowerCase())) return null;
  return trimmed;
}

function buildLocationLabel(
  session: Awaited<ReturnType<typeof authApi.listMySessions>>["items"][number],
) {
  const location = normalizeSessionLabel(session.locationLabel);
  if (location) return location;
  const ipAddress = normalizeSessionLabel(session.ipAddress);
  return ipAddress ?? "-";
}

function mapSessionRow(
  session: Awaited<ReturnType<typeof authApi.listMySessions>>["items"][number],
  formatDateTime: ReturnType<typeof useAdminDateTimeFormatter>["formatDateTime"],
): SessionRow {
  return {
    sessionId: session.sessionId,
    current: Boolean(session.current),
    revocable: Boolean(session.revocable),
    device:
      normalizeSessionLabel(session.deviceLabel) ?? normalizeSessionLabel(session.userAgent) ?? "-",
    location: buildLocationLabel(session),
    lastActiveLabel: formatDateTime(session.lastUsedAt || null, { emptyValue: "-" }),
  };
}

function useSessionRevocationMutations(t: TranslateFn, onRefresh: () => Promise<unknown>) {
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);
  const revokeSessionMutation = useMutation({
    mutationFn: async (session: SessionRow) => {
      setRevokingSessionId(session.sessionId);
      return authApi.revokeMySession(session.sessionId);
    },
    onSuccess: async () => {
      notifySuccessText(t("account:ME_SECURITY_SESSIONS_KICK_SUCCESS"));
      await onRefresh();
    },
    onError: (error) => notifyError(error),
    onSettled: () => setRevokingSessionId(null),
  });
  const revokeOthersMutation = useMutation({
    mutationFn: async () => authApi.revokeOtherSessions(),
    onSuccess: async (result) => {
      const revokedCount = result.revokedCount;
      notifySuccessText(
        t("account:ME_SECURITY_SESSIONS_KICK_ALL_SUCCESS", { count: revokedCount }),
      );
      await onRefresh();
    },
    onError: (error) => notifyError(error),
  });

  return {
    revokingSessionId,
    revokeSessionMutation,
    revokeOthersMutation,
  };
}

export function UserSessionsSection() {
  const { t } = useTranslation(["account", "common"]);
  const queryClient = useQueryClient();
  const dateTime = useAdminDateTimeFormatter();
  const [pendingRevokeSession, setPendingRevokeSession] = useState<SessionRow | null>(null);
  const [revokeOthersOpen, setRevokeOthersOpen] = useState(false);

  const sessionsQuery = useQuery({
    queryKey: ["auth", "sessions"],
    queryFn: async () => authApi.listMySessions(),
    retry: false,
    staleTime: 10 * 1000,
  });

  const refreshSessions = async () => {
    await queryClient.invalidateQueries({ queryKey: ["auth", "sessions"] });
  };

  const { revokingSessionId, revokeSessionMutation, revokeOthersMutation } =
    useSessionRevocationMutations(t, refreshSessions);

  const rows = useMemo(
    () =>
      (sessionsQuery.data?.items ?? []).map((session) =>
        mapSessionRow(session, dateTime.formatDateTime),
      ),
    [dateTime.formatDateTime, sessionsQuery.data?.items],
  );

  return (
    <>
      <SettingCard>
        <SettingCardHeader
          title={t("account:ME_SECURITY_SESSIONS_PANEL_TITLE")}
          description={t("account:ME_SECURITY_SESSIONS_TABLE_DESC")}
          action={
            <Button
              variant="outline"
              disabled={revokeOthersMutation.isPending || !rows.some((row) => row.revocable)}
              onClick={() => setRevokeOthersOpen(true)}
            >
              {t("account:ME_SECURITY_SESSIONS_KICK_ALL")}
            </Button>
          }
        />
        <SettingCardContent className="min-w-0 max-w-full overflow-x-hidden py-2">
          <ContentGuard
            loading={Boolean(sessionsQuery.isLoading && !sessionsQuery.data)}
            error={sessionsQuery.error}
            onRetry={() => {
              void sessionsQuery.refetch();
            }}
            container="raw"
            loadingVariant="table"
          >
            {sessionsQuery.isFetching && !sessionsQuery.isLoading ? (
              <div className="mb-3 flex items-center gap-2 text-footnote text-label-secondary">
                <Spinner className="size-4" />
                <span>{t("common:LOADING")}</span>
              </div>
            ) : null}
            <SecuritySessionsTableContent
              rows={rows}
              emptyText={t("account:ME_SECURITY_SESSIONS_EMPTY")}
              isRevoking={revokeSessionMutation.isPending}
              revokingSessionId={revokingSessionId}
              onRevoke={setPendingRevokeSession}
              t={t}
            />
          </ContentGuard>
        </SettingCardContent>
      </SettingCard>

      <AlertDialog
        open={Boolean(pendingRevokeSession)}
        onOpenChange={(open) => {
          if (!open && !revokeSessionMutation.isPending) {
            setPendingRevokeSession(null);
          }
        }}
      >
        <AlertDialogContent className="sm:max-w-130">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("account:ME_SECURITY_SESSIONS_KICK_CONFIRM_TITLE")}
            </AlertDialogTitle>
            {pendingRevokeSession ? (
              <AlertDialogDescription className="text-body">
                {t("account:ME_SECURITY_SESSIONS_KICK_CONFIRM_DESC", {
                  device: pendingRevokeSession.device,
                })}
              </AlertDialogDescription>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancelPrimitive asChild>
              <Button variant="ghost" disabled={revokeSessionMutation.isPending}>
                {t("common:CANCEL")}
              </Button>
            </AlertDialogCancelPrimitive>
            <AlertDialogActionPrimitive asChild>
              <Button
                variant="primary"
                loading={revokeSessionMutation.isPending}
                onClick={async () => {
                  if (!pendingRevokeSession) return;
                  await revokeSessionMutation.mutateAsync(pendingRevokeSession);
                  setPendingRevokeSession(null);
                }}
              >
                {t("account:ME_SECURITY_SESSIONS_KICK")}
              </Button>
            </AlertDialogActionPrimitive>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={revokeOthersOpen}
        onOpenChange={(open) => {
          if (!open && !revokeOthersMutation.isPending) {
            setRevokeOthersOpen(false);
          }
        }}
      >
        <AlertDialogContent className="sm:max-w-130">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("account:ME_SECURITY_SESSIONS_KICK_ALL_CONFIRM_TITLE")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-body">
              {t("account:ME_SECURITY_SESSIONS_KICK_ALL_CONFIRM_DESC")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancelPrimitive asChild>
              <Button variant="ghost" disabled={revokeOthersMutation.isPending}>
                {t("common:CANCEL")}
              </Button>
            </AlertDialogCancelPrimitive>
            <AlertDialogActionPrimitive asChild>
              <Button
                variant="primary"
                loading={revokeOthersMutation.isPending}
                onClick={async () => {
                  await revokeOthersMutation.mutateAsync();
                  setRevokeOthersOpen(false);
                }}
              >
                {t("account:ME_SECURITY_SESSIONS_KICK_ALL")}
              </Button>
            </AlertDialogActionPrimitive>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
