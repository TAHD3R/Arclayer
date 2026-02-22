import { Alert, Button, Typography } from "antd";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { resolvePostAuthRoute } from "@/lib/bootstrap-routing";
import { notifyError, notifyInfoText } from "@/lib/notifications";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

export function OnboardingView() {
  const { t } = useTranslation("onboarding");
  const navigate = useNavigate();
  const lastWorkspaceId = useWorkspaceStore((s) => s.lastWorkspaceId);
  const setCurrentWorkspaceId = useWorkspaceStore((s) => s.setCurrentWorkspaceId);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const decision = await resolvePostAuthRoute({ lastWorkspaceId, attemptRepair: true });
        if (decision.workspaceId) {
          setCurrentWorkspaceId(decision.workspaceId);
          await navigate({ to: decision.path, replace: true });
          return;
        }
      } catch {
        // Keep onboarding page visible and allow manual retry.
      } finally {
        setChecking(false);
      }
    })();
  }, [lastWorkspaceId, navigate, setCurrentWorkspaceId]);

  const retryProvisioning = async () => {
    try {
      setChecking(true);
      const decision = await resolvePostAuthRoute({ lastWorkspaceId, attemptRepair: true });
      if (decision.workspaceId) {
        setCurrentWorkspaceId(decision.workspaceId);
        await navigate({ to: decision.path, replace: true });
        return;
      }
      notifyInfoText(t("ONBOARDING_WAITING_DESC"));
    } catch (err) {
      notifyError(err);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="w-full">
      <Typography.Title level={1} className="!mt-0 !mb-2 text-largetitle text-label-primary">
        {t("ONBOARDING_TITLE")}
      </Typography.Title>
      <Typography.Paragraph className="!mt-0 !mb-5 text-title2 text-label-secondary">
        {t("ONBOARDING_SUBTITLE")}
      </Typography.Paragraph>

      {checking ? (
        <Alert
          type="info"
          showIcon
          message={t("ONBOARDING_CHECKING")}
          style={{ marginBottom: 16 }}
        />
      ) : (
        <Alert
          type="warning"
          showIcon
          message={t("ONBOARDING_WAITING_TITLE")}
          description={t("ONBOARDING_WAITING_DESC")}
          style={{ marginBottom: 16 }}
        />
      )}

      <div className="mt-5 flex justify-end gap-2">
        <Button disabled={checking} onClick={() => void navigate({ to: "/login" })}>
          {t("ONBOARDING_LOGIN_BUTTON")}
        </Button>
        <Button type="primary" loading={checking} onClick={() => void retryProvisioning()}>
          {t("ONBOARDING_RETRY_BUTTON")}
        </Button>
      </div>
    </div>
  );
}
