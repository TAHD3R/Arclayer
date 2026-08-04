import { motion, type Variants } from "motion/react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { AuthMetallicLogo } from "@/components/auth-metallic-logo";
import ShinyText from "@/components/ShinyText";
import { AuthLinkButton } from "@arclayer/ui/auth-controls";

export function LoginBrandSlogan() {
  const { t } = useTranslation();
  const headline = t("auth:LOGIN_SLOGAN_HEADLINE");
  const promise = t("auth:LOGIN_SLOGAN_PROMISE");

  return (
    <div
      data-testid="login-brand-slogan"
      className="grid w-full justify-items-center gap-6 text-center"
    >
      <AuthMetallicLogo />
      <h1
        aria-label={`${headline}. ${promise}`}
        className="grid w-full select-none gap-1.5 font-sans text-[32px] leading-9 font-medium tracking-[-1px] text-balance"
      >
        <span className="text-label-primary sm:whitespace-nowrap">{headline}</span>
        <ShinyText
          text={promise}
          speed={3.2}
          delay={0.8}
          spread={105}
          color="var(--color-label-secondary)"
          shineColor="color-mix(in oklab, var(--color-label-secondary) 55%, var(--color-label-primary))"
          className="sm:whitespace-nowrap forced-colors:text-label-primary"
        />
      </h1>
    </div>
  );
}

type AuthEntryHeaderProps = {
  mode?: "login" | "register";
  onSwitch?: () => void;
  disabled?: boolean;
  subtitleKey?: string;
  subtitle?: ReactNode;
  variants: Variants | {};
};

export function AuthEntryHeader(props: AuthEntryHeaderProps) {
  const { t } = useTranslation();
  const isRegister = props.mode === "register";
  const actionLabel = t(isRegister ? "auth:SIGN_IN" : "auth:CREATE_ACCOUNT");
  const subtitle = props.subtitle ?? (props.subtitleKey ? t(props.subtitleKey) : null);
  const showAccountSwitch = Boolean(props.mode && props.onSwitch);

  return (
    <div className="grid w-full gap-6 [&>:not(:first-child)]:mx-auto [&>:not(:first-child)]:w-full [&>:not(:first-child)]:max-w-[21.875rem]">
      <LoginBrandSlogan />
      {subtitle ? (
        <motion.p
          variants={props.variants}
          className="select-none text-center text-body text-label-secondary text-pretty"
        >
          {subtitle}
        </motion.p>
      ) : null}
      {showAccountSwitch ? (
        <motion.div
          variants={props.variants}
          data-testid="auth-account-switch"
          className="select-none text-center text-callout text-label-secondary"
        >
          <span>{t(isRegister ? "auth:HAVE_ACCOUNT" : "auth:NO_ACCOUNT")} </span>
          <AuthLinkButton
            className="!px-1 !text-callout font-normal text-label-primary underline"
            disabled={props.disabled}
            onClick={props.onSwitch}
            type="button"
          >
            {actionLabel}
          </AuthLinkButton>
        </motion.div>
      ) : null}
    </div>
  );
}
