import { CircleHelp, CircleX, Info } from "lucide-react";
import { motion, type Variants } from "motion/react";
import { type ReactNode, useId } from "react";

import { LegalFooter } from "@/components/layout/legal-footer";
import { cn } from "@arclayer/lib/utils";
import { Alert, AlertDescription } from "@arclayer/ui/alert";
import { FieldTitle } from "@arclayer/ui/field";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@arclayer/ui/input-otp";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@arclayer/ui/tooltip";

export const AUTH_PANE_ROOT_CLASS =
  "grid w-full max-w-[25.875rem] gap-6 [&>:not(:first-child)]:mx-auto [&>:not(:first-child)]:w-full md:[&>:not(:first-child)]:px-8";
export const AUTH_PANE_CONTENT_CLASS = "grid gap-4";
export const AUTH_FIELD_CLASS = "gap-2";
export const AUTH_FIELD_TITLE_CLASS = "select-none text-headline text-label-primary";
export const AUTH_INPUT_GROUP_CLASS = cn(
  "h-10 min-w-0 rounded-md border-border bg-card dark:bg-card! ",
  "has-[[data-slot=input-group-control]:focus-visible]:border-primary",
  "has-[[data-slot=input-group-control]:focus-visible]:ring-primary/15",
);
export const AUTH_INPUT_CLASS =
  "h-10 min-w-0 px-0 text-callout placeholder:text-label-tertiary md:text-callout";
export const AUTH_PILL_INPUT_GROUP_CLASS = cn(
  AUTH_INPUT_GROUP_CLASS,
  "h-14! rounded-full!",
  "[&>[data-align=inline-end]]:mr-0! [&>[data-align=inline-end]]:pr-4!",
);
export const AUTH_PILL_INPUT_CLASS = cn(AUTH_INPUT_CLASS, "h-14! text-body md:text-body");
export const AUTH_PILL_BUTTON_CLASS = cn(
  "h-14! w-full rounded-full! bg-primary text-primary-foreground hover:bg-primary!",
);
export const AUTH_PILL_OUTLINE_BUTTON_CLASS = cn(
  AUTH_PILL_BUTTON_CLASS,
  "border-border bg-card dark:bg-card! text-label-primary! hover:bg-accent! hover:text-accent-foreground!",
);
export const AUTH_PILL_GHOST_BUTTON_CLASS = cn(
  "h-10! w-full rounded-full!",
  "bg-transparent! text-label-secondary hover:bg-accent! hover:text-label-primary",
);
export const AUTH_PILL_PLAIN_INPUT_CLASS = cn(
  "h-14! min-w-0 rounded-full! border-border bg-card dark:bg-card! px-5 text-body",
  "placeholder:text-label-tertiary focus-visible:ring-primary/15 md:text-body",
);
export const AUTH_PLAIN_INPUT_CLASS = cn(
  "h-10 min-w-0 rounded-md border-border bg-card dark:bg-card! px-4 text-callout ",
  "placeholder:text-label-tertiary focus-visible:ring-primary/15 md:text-callout",
);
export const AUTH_OTP_CONTAINER_CLASS = "w-full min-w-0";
export const AUTH_OTP_GROUP_CLASS = "grid w-full min-w-0 grid-cols-6 gap-2.5";
export const AUTH_OTP_SLOT_CLASS = cn(
  "h-14! min-w-0 w-full flex-1 rounded-2xl! border border-border bg-card dark:bg-card!",
  "text-callout font-semibold text-label-primary transition-colors",
);
export const AUTH_INLINE_NOTICE_CLASS = cn("text-callout text-label-secondary");
export const AUTH_PANE_META_CLASS =
  "grid select-none gap-2.5 text-center text-callout text-label-secondary";

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

export function AuthFormFeedback(props: {
  message?: string | null;
  action?: ReactNode;
  tone?: "danger" | "neutral";
  variants?: Variants | {};
}) {
  if (!props.message) return null;

  const danger = props.tone !== "neutral";

  const content = (
    <Alert
      role={danger ? "alert" : "status"}
      variant={danger ? "destructive" : "default"}
      className={cn(
        "rounded-[1.75rem] bg-card px-4 py-3 text-callout",
        danger
          ? "border-destructive/30 [&>svg]:text-destructive!"
          : "border-border [&>svg]:text-label-secondary!",
      )}
    >
      {danger ? <CircleX aria-hidden="true" /> : <Info aria-hidden="true" />}
      <AlertDescription
        className={cn(
          "flex flex-wrap items-baseline gap-x-1.5 text-callout! leading-5",
          danger ? "text-destructive!" : "text-label-secondary!",
        )}
      >
        <span>{props.message}</span>
        {props.action}
      </AlertDescription>
    </Alert>
  );

  return props.variants ? <motion.div variants={props.variants}>{content}</motion.div> : content;
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
    <motion.div
      variants={props.variants}
      className={cn(
        "mx-auto grid w-[70%]! select-none gap-1 text-center md:w-3/4!",
        props.className,
      )}
    >
      <LegalFooter i18nKey={props.i18nKey} className="text-footnote leading-5" />
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
