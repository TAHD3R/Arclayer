import { motion, type Variants } from "motion/react";

import { AuthLinkButton } from "@arclayer/ui/auth-controls";
import { Button } from "@arclayer/ui/button";
import { WorkspaceAvatar } from "@/components/common/entity-avatar";

type InviteLoggedInPaneProps = {
  t: (key: string, params?: Record<string, unknown>) => string;
  data: {
    workspace?: { name?: string; logoUrl?: string | null } | null;
    invitation: { email?: string | null; maskedEmail?: string | null };
  };
  meEmail: string | null | undefined;
  targetName: string;
  roleResolved: { name: string; description: string | null };
  hasBoundEmail: boolean;
  emailMatches: boolean;
  acceptLoading: boolean;
  onJoin: () => void;
  onLogoutAndSwitch: () => Promise<void>;
  v: Variants | Record<string, never>;
  staggerContainer: Variants;
};

export function InviteLoggedInPane({
  t,
  data,
  meEmail,
  targetName,
  roleResolved,
  hasBoundEmail,
  emailMatches,
  acceptLoading,
  onJoin,
  onLogoutAndSwitch,
  v,
  staggerContainer,
}: InviteLoggedInPaneProps) {
  return (
    <motion.div
      className="flex flex-col items-center text-center"
      initial="hidden"
      animate="show"
      variants={staggerContainer}
    >
      <motion.div variants={v}>
        <WorkspaceAvatar
          name={data.workspace?.name || targetName}
          assetRef={data.workspace?.logoUrl}
          size={80}
        />
      </motion.div>

      <motion.div variants={v}>
        <h1 className="mt-3 text-largetitle text-label-primary">
          {t("invite:INVITE_STEP2_TITLE")}
        </h1>
      </motion.div>

      <motion.div variants={v} className="mt-2 text-headline text-label-secondary">
        {hasBoundEmail
          ? emailMatches
            ? t("invite:INVITE_LOGGED_IN_MATCH")
            : t("invite:INVITE_LOGGED_IN_MISMATCH")
          : t("invite:INVITE_LOGGED_IN_GENERIC")}
      </motion.div>

      <motion.div
        variants={v}
        className="mt-4 w-full rounded-lg border border-(--color-border) bg-muted/30 p-4 text-center text-headline"
      >
        <div className="text-label-secondary">{t("invite:INVITE_CURRENT_ACCOUNT")}</div>
        <div className="font-medium text-label-primary">
          {meEmail || t("invite:INVITE_EMAIL_UNKNOWN")}
        </div>
        {hasBoundEmail && data.invitation.maskedEmail ? (
          <>
            <div className="mt-2 text-label-secondary">{t("invite:INVITE_INVITED_EMAIL")}</div>
            <div className="font-medium text-label-primary">{data.invitation.maskedEmail}</div>
          </>
        ) : null}
      </motion.div>

      <motion.div variants={v} className="mt-3 text-center">
        <div className="text-headline font-medium text-label-secondary">{roleResolved.name}</div>
        {roleResolved.description && (
          <div className="mt-0.5 text-callout text-label-tertiary">{roleResolved.description}</div>
        )}
      </motion.div>

      <motion.div variants={v} className="mt-5">
        <Button
          className="rounded-full px-8"
          size="lg"
          loading={acceptLoading}
          onClick={() => void onJoin()}
        >
          {hasBoundEmail && !emailMatches
            ? t("invite:INVITE_ACTION_JOIN_ANYWAY")
            : t("invite:INVITE_ACTION_JOIN")}
        </Button>
      </motion.div>

      {hasBoundEmail && !emailMatches ? (
        <motion.div variants={v} className="mt-3">
          <AuthLinkButton onClick={() => void onLogoutAndSwitch()} size="sm" type="button">
            {t("invite:INVITE_ACTION_LOGOUT_SWITCH")}
          </AuthLinkButton>
        </motion.div>
      ) : null}
    </motion.div>
  );
}
