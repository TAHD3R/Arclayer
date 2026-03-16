import { useEffect, useRef } from "react";
import { AnimatePresence, MotionConfig, motion, type Variants } from "motion/react";

import { AuthLinkButton } from "@/components/ui/auth-controls";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { getErrorMessage } from "@/lib/notifications";
import { ContentGuard } from "@/components/common/content-guard";
import { Button } from "@arclayer/ui/button";
import { Card } from "@arclayer/ui/card";
import { InviteTokenInputDialog } from "./invite-token-input-dialog";

import { useAcceptInvite } from "../hooks/use-accept-invite";
import type { JoinMode } from "../types";
import { InvitePreviewPane } from "./invite-preview-pane";
import { InviteLoggedInPane } from "./invite-logged-in-pane";
import { InviteGuestJoinPane } from "./invite-guest-join-pane";
import { InviteConfirmJoinDialog } from "./invite-confirm-join-dialog";

export function InvitationsView(props: { token: string | null }) {
  const state = useAcceptInvite(props.token);
  const reducedMotion = usePrefersReducedMotion();

  const prevStepRef = useRef(state.step);
  const prevJoinModeRef = useRef<JoinMode>(state.mode);

  const modeDirection =
    state.mode === prevJoinModeRef.current ? 0 : state.mode === "register" ? 1 : -1;
  const modeEnterX = modeDirection > 0 ? 8 : modeDirection < 0 ? -8 : 0;
  const modeExitX = modeDirection > 0 ? -8 : modeDirection < 0 ? 8 : 0;

  const stepDirection =
    state.step === prevStepRef.current ? 0 : state.step > prevStepRef.current ? 1 : -1;
  const enterOffsetX = stepDirection > 0 ? 14 : stepDirection < 0 ? -14 : 0;
  const exitOffsetX = stepDirection > 0 ? -14 : stepDirection < 0 ? 14 : 0;

  useEffect(() => {
    prevStepRef.current = state.step;
  }, [state.step]);
  useEffect(() => {
    prevJoinModeRef.current = state.mode;
  }, [state.mode]);

  const transition = reducedMotion
    ? ({ duration: 0.01 } as const)
    : ({ duration: 0.18, ease: [0.2, 0, 0, 1] as const } as const);

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 8 },
    show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
    exit: { opacity: 0, y: -4, transition: { duration: 0.12 } },
  };
  const v = reducedMotion ? {} : itemVariants;
  const staggerContainer: Variants = {
    show: reducedMotion ? {} : { transition: { staggerChildren: 0.05 } },
  };

  // Shared action buttons for empty/error states
  const tokenActions = (
    <div className="flex flex-wrap justify-center gap-3">
      <AuthLinkButton onClick={() => void state.onBackToLogin()} type="button">
        {state.t("invite:INVITE_ACTION_BACK_TO_LOGIN")}
      </AuthLinkButton>
      <Button onClick={() => state.setTokenDialogOpen(true)}>
        {state.t("invite:INVITE_ACTION_ENTER_TOKEN")}
      </Button>
    </div>
  );
  const tokenActionsWithRetry = (
    <div className="flex flex-wrap justify-center gap-3">
      <AuthLinkButton onClick={() => state.setTokenDialogOpen(true)} type="button">
        {state.t("invite:INVITE_ACTION_ENTER_TOKEN")}
      </AuthLinkButton>
      <Button onClick={() => void state.previewQuery.refetch()}>{state.t("common:RETRY")}</Button>
    </div>
  );

  // Determine loading state for the join step ContentGuard
  const joinLoading = state.previewQuery.isLoading || (state.isLoggedIn && state.meQuery.isLoading);

  // Centralized guard: renders Card + ContentGuard for no-token / business-failure / loading / error
  const renderGuarded = (loading: boolean, children: React.ReactNode) => {
    if (!state.token) {
      return (
        <Card className="p-8">
          <ContentGuard
            loading={false}
            empty
            variant="compact"
            emptyTitle={state.t("invite:INVITE_TOKEN_MISSING")}
            emptyDescription={state.t("invite:INVITE_TOKEN_MISSING_DESC")}
            emptyExtra={tokenActions}
          />
        </Card>
      );
    }
    if (state.inviteBusinessFailure) {
      return (
        <Card className="p-8">
          <ContentGuard
            loading={false}
            empty
            variant="compact"
            emptyTitle={state.inviteBusinessFailure.title}
            emptyDescription={state.inviteBusinessFailure.description}
            emptyExtra={tokenActions}
          />
        </Card>
      );
    }
    return (
      <Card className="p-8">
        <ContentGuard
          loading={loading}
          error={state.previewQuery.isError ? state.previewQuery.error : null}
          onRetry={() => void state.previewQuery.refetch()}
          hideRetry
          variant="compact"
          loadingVariant="form"
          errorTitle={state.t("invite:INVITE_PREVIEW_FAILED")}
          errorDescription={
            state.previewQuery.isError ? getErrorMessage(state.previewQuery.error) : undefined
          }
          errorExtra={tokenActionsWithRetry}
        >
          {children}
        </ContentGuard>
      </Card>
    );
  };

  return (
    <div className="mx-auto w-full max-w-[480px] pt-12">
      <InviteTokenInputDialog
        open={state.tokenDialogOpen}
        onOpenChange={state.setTokenDialogOpen}
        onSubmit={async (nextToken) => {
          await state.applyToken(nextToken);
        }}
      />

      <InviteConfirmJoinDialog
        open={state.confirmOpen}
        onOpenChange={state.setConfirmOpen}
        onConfirm={() => void state.handleConfirmJoin()}
        email={state.myEmail || state.inviteEmail}
        targetName={state.targetName}
        roleName={state.roleResolved.name}
        roleDescription={state.roleResolved.description}
      />

      <MotionConfig transition={transition}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={state.step}
            initial={{ opacity: 0, x: enterOffsetX }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: exitOffsetX }}
          >
            <div className="w-full">
              {state.step === 0
                ? renderGuarded(
                    state.previewQuery.isLoading,
                    state.previewQuery.data ? (
                      <InvitePreviewPane
                        t={state.t}
                        data={state.previewQuery.data}
                        isOrgOnlyInvite={state.isOrgOnlyInvite}
                        targetName={state.targetName}
                        roleResolved={state.roleResolved}
                        inviterLabel={state.inviterLabel}
                        expiresRelativeText={state.expiresRelativeText}
                        isLoggedIn={state.isLoggedIn}
                        onContinue={state.onContinue}
                        onBackToLogin={state.onBackToLogin}
                        v={v}
                        staggerContainer={staggerContainer}
                      />
                    ) : null,
                  )
                : state.isLoggedIn
                  ? renderGuarded(
                      joinLoading,
                      state.previewQuery.data ? (
                        <InviteLoggedInPane
                          t={state.t}
                          data={state.previewQuery.data}
                          meEmail={state.meQuery.data?.email}
                          isOrgOnlyInvite={state.isOrgOnlyInvite}
                          targetName={state.targetName}
                          roleResolved={state.roleResolved}
                          hasBoundEmail={state.hasBoundEmail}
                          emailMatches={state.emailMatches}
                          acceptLoading={state.acceptExistingMutation.isPending}
                          onJoin={state.joinAsExistingLoggedIn}
                          onLogoutAndSwitch={state.onLogoutAndSwitch}
                          v={v}
                          staggerContainer={staggerContainer}
                        />
                      ) : null,
                    )
                  : renderGuarded(
                      state.previewQuery.isLoading,
                      state.previewQuery.data ? (
                        <InviteGuestJoinPane
                          t={state.t}
                          mode={state.mode}
                          setMode={state.setMode}
                          onBack={() => state.setStep(0)}
                          reducedMotion={reducedMotion}
                          previewData={state.previewQuery.data}
                          isOrgOnlyInvite={state.isOrgOnlyInvite}
                          hasBoundEmail={state.hasBoundEmail}
                          keepSession={state.keepSession}
                          loginLoading={
                            state.loginMutation.isPending || state.acceptExistingMutation.isPending
                          }
                          registerLoading={state.registerAcceptMutation.isPending}
                          forgotLoading={state.forgotPasswordMutation.isPending}
                          onLoginAndJoin={state.onLoginAndJoin}
                          onRegisterAndJoin={state.onRegisterAndJoin}
                          onForgotPassword={state.onForgotPassword}
                          onBackToLogin={state.onBackToLogin}
                          v={v}
                          modeEnterX={modeEnterX}
                          modeExitX={modeExitX}
                        />
                      ) : null,
                    )}
            </div>
          </motion.div>
        </AnimatePresence>
      </MotionConfig>
    </div>
  );
}
