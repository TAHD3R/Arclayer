import { useState, type PropsWithChildren } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";

import * as authApi from "@/api/auth";
import { AuthPreferencesBar } from "@/layouts/auth-preferences-bar";
import { AuthSceneLayout } from "@/layouts/auth-scene-layout";
import { OnboardingStepProgress } from "@/pages/onboarding/welcome/components/onboarding-step-progress";
import type { WelcomeOnboardingStepId } from "@/pages/onboarding/welcome/types";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { Button } from "@arclayer/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@arclayer/ui/alert-dialog";

export function OnboardingLayout(
  props: PropsWithChildren<{
    currentStep?: WelcomeOnboardingStepId;
    contentMaxClassName?: string;
    headerBack?: boolean;
    steps?: readonly WelcomeOnboardingStepId[];
    onHeaderBack?: () => void;
  }>,
) {
  const { t } = useTranslation(["onboarding", "common"]);
  const navigate = useNavigate();
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const clearAuth = useAuthStore((state) => state.clear);
  const clearWorkspace = useWorkspaceStore((state) => state.clearWorkspace);
  const [signOutOpen, setSignOutOpen] = useState(false);

  const handleSignOut = () => {
    void (async () => {
      try {
        await authApi.logout({ refreshToken });
      } finally {
        clearAuth();
        clearWorkspace();
        await navigate({ to: "/login", replace: true });
      }
    })();
  };

  return (
    <AuthSceneLayout
      logoTo="/welcome"
      contentMaxClassName={props.contentMaxClassName ?? "max-w-xl"}
      hideLogo
      headerLeading={
        props.headerBack ? (
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label={t("common:BACK")}
            onClick={props.onHeaderBack}
          >
            <ArrowLeftIcon className="size-5" />
          </Button>
        ) : null
      }
      headerAfterLogo={
        props.currentStep && props.steps ? (
          <OnboardingStepProgress steps={props.steps} currentStep={props.currentStep} />
        ) : null
      }
      footer={
        <AuthPreferencesBar
          trailing={
            <>
              <span className="shrink-0 text-label-tertiary" aria-hidden="true">
                ｜
              </span>
              <Button
                variant="ghost"
                className="h-8 shrink-0 px-2 text-callout text-label-primary hover:bg-muted/60"
                onClick={() => setSignOutOpen(true)}
              >
                {t("WELCOME_SIGN_OUT")}
              </Button>
            </>
          }
        />
      }
    >
      {props.children}
      <AlertDialog open={signOutOpen} onOpenChange={setSignOutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("WELCOME_SIGN_OUT_CONFIRM_TITLE")}</AlertDialogTitle>
            <AlertDialogDescription>{t("WELCOME_SIGN_OUT_CONFIRM_DESC")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common:CANCEL")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleSignOut}>
              {t("WELCOME_SIGN_OUT_CONFIRM_ACTION")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AuthSceneLayout>
  );
}
