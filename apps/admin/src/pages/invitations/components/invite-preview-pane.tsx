import { motion, type Variants } from "motion/react";

import { AuthLinkButton } from "@/components/ui/auth-controls";
import { Button } from "@celestial/ui/button";
import { OrganizationAvatar } from "@/components/common/entity-avatar";

type InvitePreviewPaneProps = {
  t: (key: string, params?: Record<string, unknown>) => string;
  data: {
    organization: { name: string; logoUrl?: string | null };
    workspace?: { name?: string } | null;
    userExists?: boolean;
  };
  isOrgOnlyInvite: boolean | undefined;
  targetName: string;
  roleResolved: { name: string; description: string | null };
  inviterLabel: string | null;
  expiresRelativeText: string;
  isLoggedIn: boolean;
  onContinue: () => void;
  onBackToLogin: () => Promise<void>;
  v: Variants | Record<string, never>;
  staggerContainer: Variants;
};

export function InvitePreviewPane({
  t,
  data,
  isOrgOnlyInvite,
  targetName,
  roleResolved,
  inviterLabel,
  expiresRelativeText,
  isLoggedIn,
  onContinue,
  onBackToLogin,
  v,
  staggerContainer,
}: InvitePreviewPaneProps) {
  return (
    <motion.div
      className="flex flex-col items-center text-center"
      initial="hidden"
      animate="show"
      variants={staggerContainer}
    >
      <motion.div variants={v}>
        <OrganizationAvatar
          name={data.organization.name || targetName}
          assetRef={data.organization.logoUrl}
          size={80}
        />
      </motion.div>

      <motion.div variants={v} className="mt-4 text-largetitle font-semibold text-label-primary">
        {targetName}
      </motion.div>

      {!isOrgOnlyInvite && (
        <motion.div variants={v} className="mt-1 text-headline text-label-secondary">
          {data.organization.name}
        </motion.div>
      )}

      <motion.div variants={v} className="mt-2 text-center">
        <div className="text-headline text-label-secondary">{roleResolved.name}</div>
        {roleResolved.description && (
          <div className="mt-0.5 text-callout text-label-tertiary">{roleResolved.description}</div>
        )}
      </motion.div>

      <motion.div variants={v} className="mt-3 text-headline text-label-secondary">
        {inviterLabel
          ? t("invite:INVITE_PREVIEW_INVITED_BY", { inviter: inviterLabel })
          : t("invite:INVITE_PREVIEW_INVITED_GENERIC")}
      </motion.div>

      <motion.div variants={v} className="mt-1 text-callout text-label-tertiary">
        {expiresRelativeText}
      </motion.div>

      <motion.div variants={v} className="mt-6">
        <Button className="rounded-full px-8" size="lg" onClick={onContinue}>
          {t(
            isOrgOnlyInvite
              ? "invite:INVITE_ACTION_ACCEPT_JOIN_ORG"
              : "invite:INVITE_ACTION_ACCEPT_JOIN",
          )}
        </Button>
      </motion.div>

      {!isLoggedIn && data.userExists && (
        <motion.div variants={v} className="mt-3">
          <AuthLinkButton onClick={() => void onBackToLogin()} size="sm" type="button">
            {t("invite:INVITE_ACTION_SWITCH_TO_LOGIN")}
          </AuthLinkButton>
        </motion.div>
      )}

      <motion.div variants={v} className="mt-4 text-callout text-label-tertiary">
        {t(isOrgOnlyInvite ? "invite:INVITE_SCOPE_ORGANIZATION" : "invite:INVITE_SCOPE_WORKSPACE")}
      </motion.div>
    </motion.div>
  );
}
