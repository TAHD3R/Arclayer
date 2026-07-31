import { useMutation, useQuery } from "@tanstack/react-query";
import { CircleAlert, ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  createWorkspaceCustomerPortalSession,
  getWorkspaceCommercialAccess,
  getWorkspacePaymentRecovery,
} from "@/api/commerce";
import { getErrorMessage } from "@/lib/notifications";
import { Alert, AlertDescription, AlertTitle } from "@arclayer/ui/alert";
import { Button } from "@arclayer/ui/button";

const OPEN_PAYMENT_RECOVERY = "open_payment_recovery";

export function PaymentRestrictedNotice({ workspaceId }: { workspaceId: string | null }) {
  const { t } = useTranslation("commerce");
  const accessQuery = useQuery({
    queryKey: ["commerce", "workspace", workspaceId, "access"],
    queryFn: ({ signal }) => getWorkspaceCommercialAccess(String(workspaceId), signal),
    enabled: Boolean(workspaceId),
    retry: false,
    meta: { silent: true },
  });
  const paymentRestricted = accessQuery.data?.state === "payment_restricted";
  const recoveryQuery = useQuery({
    queryKey: ["commerce", "workspace", workspaceId, "payment-recovery"],
    queryFn: ({ signal }) => getWorkspacePaymentRecovery(String(workspaceId), signal),
    enabled: Boolean(workspaceId) && paymentRestricted,
    retry: false,
    meta: { silent: true },
  });
  const portalMutation = useMutation({
    mutationFn: () => createWorkspaceCustomerPortalSession(String(workspaceId)),
    onSuccess: (redirect) => window.location.assign(redirect.url),
  });

  if (!paymentRestricted) return null;

  const canRecover = recoveryQuery.data?.permittedRecoveryAction === OPEN_PAYMENT_RECOVERY;
  return (
    <Alert
      className="rounded-none border-x-0 border-t-0 border-amber-500/30 bg-amber-500/8 text-amber-950 dark:text-amber-100"
      data-testid="payment-restricted-notice"
    >
      <CircleAlert className="text-amber-600 dark:text-amber-300" />
      <AlertTitle className="text-headline font-semibold">
        {t("commerce:PAYMENT_RESTRICTED_NOTICE_TITLE")}
      </AlertTitle>
      <AlertDescription className="flex flex-wrap items-center gap-x-4 gap-y-3 text-callout! text-amber-800/90 dark:text-amber-200/85">
        <span>{t("commerce:PAYMENT_RESTRICTED_NOTICE_DESCRIPTION")}</span>
        <span>{t("commerce:PAYMENT_RESTRICTED_BLOCKED_COMMANDS")}</span>
        {accessQuery.data?.billingContactRequired ? (
          <span>{t("commerce:PAYMENT_RESTRICTED_CONTACT_BILLING")}</span>
        ) : null}
        {canRecover ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            loading={portalMutation.isPending}
            onClick={() => portalMutation.mutate()}
          >
            {t("commerce:PAYMENT_RESTRICTED_RECOVERY_ACTION")}
            <ExternalLink data-icon="inline-end" aria-hidden="true" />
          </Button>
        ) : null}
        {portalMutation.error ? (
          <span role="alert">{getErrorMessage(portalMutation.error)}</span>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
