import { CircleHelp } from "lucide-react";
import { motion, type Variants } from "motion/react";
import { type ReactNode, useId } from "react";
import { useTranslation } from "react-i18next";

import { AdminFullLogo } from "@/components/layout/admin-logo";
import { LegalFooter } from "@/components/layout/legal-footer";
import { cn } from "@arclayer/lib/utils";
import { FieldTitle } from "@arclayer/ui/field";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@arclayer/ui/input-otp";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@arclayer/ui/tooltip";

export const AUTH_PANE_STACK_CLASS = "grid gap-5";
export const AUTH_PANE_ROOT_CLASS = "grid gap-8";
export const AUTH_PANE_CONTENT_CLASS = "grid gap-2";
export const AUTH_FIELD_CLASS = "gap-2";
export const AUTH_FIELD_TITLE_CLASS = "text-headline text-label-primary";
export const AUTH_INPUT_GROUP_CLASS = cn(
  "h-10 min-w-0 rounded-md border-border/80 bg-card ",
  "has-[[data-slot=input-group-control]:focus-visible]:border-primary",
  "has-[[data-slot=input-group-control]:focus-visible]:ring-primary/15",
);
export const AUTH_INPUT_CLASS =
  "h-10 min-w-0 px-0 text-callout placeholder:text-label-tertiary md:text-callout";
export const AUTH_PLAIN_INPUT_CLASS = cn(
  "h-10 min-w-0 rounded-md border-border/80 bg-card px-4 text-callout ",
  "placeholder:text-label-tertiary focus-visible:ring-primary/15 md:text-callout",
);
export const AUTH_OTP_CONTAINER_CLASS = "w-full min-w-0";
export const AUTH_OTP_GROUP_CLASS = "grid w-full min-w-0 grid-cols-6 gap-2.5";
export const AUTH_OTP_SLOT_CLASS = cn(
  "h-10 min-w-0 w-full flex-1 rounded-md border border-border/80 bg-card",
  "text-callout font-semibold text-label-primary transition-colors",
);
export const AUTH_INLINE_NOTICE_CLASS = cn("text-callout text-label-secondary");
export const AUTH_PANE_META_CLASS = "grid gap-2.5 text-center text-body text-label-secondary";

export function AuthPaneHeader(props: {
  titleKey: string;
  subtitleKey?: string;
  subtitle?: ReactNode;
  variants: Variants | {};
}) {
  const { t } = useTranslation();
  const subtitle = props.subtitle ?? (props.subtitleKey ? t(props.subtitleKey) : null);

  return (
    <motion.div variants={props.variants} className="grid gap-2.5">
      <div className="select-none">
        <AdminFullLogo to="/login" ariaLabel="Arclayer" width={132} />
      </div>
      <div className="grid gap-2">
        <h1 className="select-none text-largetitle text-label-primary">{t(props.titleKey)}</h1>
        {subtitle ? (
          <p className="select-none text-body text-label-secondary text-pretty">{subtitle}</p>
        ) : null}
      </div>
    </motion.div>
  );
}

function AuthFieldHelpTooltip(props: { content: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={props.content}
            className={cn(
              "inline-flex size-4 items-center justify-center rounded-full text-label-tertiary",
              "transition-colors hover:text-label-secondary focus-visible:outline-none",
              "focus-visible:ring-2 focus-visible:ring-primary/20",
            )}
          >
            <CircleHelp className="size-3.5" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-64 text-left">
          <div className="w-full text-left text-pretty">{props.content}</div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function AuthPaneTitleRow(props: { title: string; helpText?: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-1.5">
        <FieldTitle className={cn(AUTH_FIELD_TITLE_CLASS, "min-w-0")}>{props.title}</FieldTitle>
        {props.helpText ? <AuthFieldHelpTooltip content={props.helpText} /> : null}
      </div>
      {props.action ? <div className="shrink-0">{props.action}</div> : null}
    </div>
  );
}

export function AuthButtonLabel(props: { children: ReactNode }) {
  return <span>{props.children}</span>;
}

export function AuthOtpInput(props: {
  value: string;
  onChange: (value: string) => void;
  "aria-label"?: string;
  ariaLabel?: string;
  disabled?: boolean;
  invalid?: boolean;
  maxLength?: number;
}) {
  const inputId = useId();
  const accessibleLabel = props["aria-label"] ?? props.ariaLabel ?? "";

  return (
    <>
      <label htmlFor={inputId} className="sr-only">
        {accessibleLabel}
      </label>
      <InputOTP
        id={inputId}
        value={props.value}
        onChange={props.onChange}
        maxLength={props.maxLength ?? 6}
        aria-label={accessibleLabel}
        aria-invalid={props.invalid ? true : undefined}
        autoComplete="one-time-code"
        inputMode="numeric"
        disabled={props.disabled}
        pushPasswordManagerStrategy="none"
        containerClassName={AUTH_OTP_CONTAINER_CLASS}
      >
        <InputOTPGroup className={AUTH_OTP_GROUP_CLASS}>
          <InputOTPSlot index={0} className={AUTH_OTP_SLOT_CLASS} />
          <InputOTPSlot index={1} className={AUTH_OTP_SLOT_CLASS} />
          <InputOTPSlot index={2} className={AUTH_OTP_SLOT_CLASS} />
          <InputOTPSlot index={3} className={AUTH_OTP_SLOT_CLASS} />
          <InputOTPSlot index={4} className={AUTH_OTP_SLOT_CLASS} />
          <InputOTPSlot index={5} className={AUTH_OTP_SLOT_CLASS} />
        </InputOTPGroup>
      </InputOTP>
    </>
  );
}

export function AuthPaneLegal(props: {
  i18nKey: string;
  variants: Variants | {};
  className?: string;
}) {
  return (
    <motion.div variants={props.variants} className={cn("grid gap-1 text-center", props.className)}>
      <LegalFooter i18nKey={props.i18nKey} className="text-body" />
    </motion.div>
  );
}

export function AuthInlineNotice(props: {
  children: ReactNode;
  variants?: Variants | {};
  tone?: "default" | "danger";
}) {
  const toneClassName = props.tone === "danger" ? "text-danger" : "text-label-secondary";

  const content = (
    <div className={cn(AUTH_INLINE_NOTICE_CLASS, toneClassName)}>{props.children}</div>
  );

  if (!props.variants) {
    return content;
  }

  return <motion.div variants={props.variants}>{content}</motion.div>;
}
