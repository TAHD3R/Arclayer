import { motion, type Variants } from "motion/react";
import { useTranslation } from "react-i18next";

import { AuthOauthButtons } from "@/components/ui/oauth-buttons";
import { Button } from "@arclayer/ui/button";

import {
  AUTH_PANE_ROOT_CLASS,
  AUTH_OUTLINE_BUTTON_CLASS,
  AuthPaneLegal,
} from "./auth-pane-primitives";
import { AuthEntryHeader } from "./login-brand-slogan";

type LoginMethodPaneProps = {
  disabled: boolean;
  redirect?: string;
  pendingOAuthProvider?: string | null;
  onStartOAuth?: (input: { provider: string; startUrl: string; keepSession: boolean }) => void;
  onContinueWithEmail: () => void;
  reducedMotion: boolean;
  itemVariants: Variants;
};

export function LoginMethodPane(props: LoginMethodPaneProps) {
  const { t } = useTranslation();
  const variants = props.reducedMotion ? {} : props.itemVariants;

  return (
    <div className={AUTH_PANE_ROOT_CLASS}>
      <AuthEntryHeader variants={variants} />
      <div className="grid gap-6">
        <motion.div variants={variants} className="empty:hidden">
          <AuthOauthButtons
            disabled={props.disabled}
            redirect={props.redirect}
            dividerLabelKey="auth:OAUTH_METHOD_DIVIDER"
            dividerPlacement="after"
            providerLayout="primary-plus-grid"
            loadingProvider={props.pendingOAuthProvider}
            onProviderStart={
              props.onStartOAuth
                ? ({ provider, startUrl }) =>
                    props.onStartOAuth?.({ provider, startUrl, keepSession: true })
                : undefined
            }
          />
        </motion.div>
        <motion.div variants={variants} className="grid">
          <Button
            className={AUTH_OUTLINE_BUTTON_CLASS}
            type="button"
            size="lg"
            variant="outline"
            disabled={props.disabled}
            onClick={props.onContinueWithEmail}
          >
            {t("auth:LOGIN_CONTINUE_EMAIL")}
          </Button>
        </motion.div>
        <AuthPaneLegal i18nKey="auth:LEGAL_CONTINUE" variants={variants} />
      </div>
    </div>
  );
}
