import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { useSystemRuntime } from "@/hooks/use-system-runtime";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { Card } from "@arclayer/ui/card";

import { InvitationInstanceGate } from "./components/invitation-instance-gate";
import { InvitationsView } from "./components/invitations-view";

const invitationsRouteApi = getRouteApi("/invitations/");

export function InvitationsPage() {
  const { token } = invitationsRouteApi.useSearch();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const runtime = useSystemRuntime();

  if (!runtime.runtime) {
    return (
      <Card className="p-8">
        <ContentGuard loading loadingVariant="form" />
      </Card>
    );
  }

  if (runtime.instanceSetupStatus === "uninitialized") {
    const redirect = token ? `/invitations?token=${encodeURIComponent(token)}` : "/invitations";
    return (
      <InvitationInstanceGate
        title={t("invite:INVITE_SETUP_REQUIRED_TITLE")}
        description={t("invite:INVITE_SETUP_REQUIRED_DESC")}
        actionLabel={t("invite:INVITE_SETUP_REQUIRED_ACTION")}
        onAction={() => void navigate({ to: "/login", search: { redirect } })}
      />
    );
  }

  if (runtime.instanceSetupStatus === "repair_required") {
    return (
      <InvitationInstanceGate
        title={t("invite:INVITE_REPAIR_REQUIRED_TITLE")}
        description={t("invite:INVITE_REPAIR_REQUIRED_DESC")}
        actionLabel={t("invite:INVITE_REPAIR_REQUIRED_ACTION")}
        reason={runtime.instanceSetupRepairReason}
        onAction={() => window.location.reload()}
      />
    );
  }

  return <InvitationsView token={token ?? null} />;
}
