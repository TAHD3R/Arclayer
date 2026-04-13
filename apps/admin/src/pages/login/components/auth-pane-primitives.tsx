import { motion, type Variants } from "motion/react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { AdminFullLogo } from "@/components/layout/admin-logo";
import { LegalFooter } from "@/components/layout/legal-footer";
import { cn } from "@arclayer/lib/utils";
import { FieldTitle } from "@arclayer/ui/field";

export const AUTH_PANE_STACK_CLASS = "grid gap-5";
export const AUTH_FIELD_CLASS = "gap-2";
export const AUTH_FIELD_TITLE_CLASS = "text-headline text-label-primary";
export const AUTH_INPUT_GROUP_CLASS = cn(
  "h-10 min-w-0 rounded-xl border-border/80 bg-card ",
  "has-[[data-slot=input-group-control]:focus-visible]:border-primary",
  "has-[[data-slot=input-group-control]:focus-visible]:ring-primary/15",
);
export const AUTH_INPUT_CLASS =
  "h-10 min-w-0 px-0 text-callout placeholder:text-label-tertiary md:text-callout";
export const AUTH_PLAIN_INPUT_CLASS = cn(
  "h-10 min-w-0 rounded-xl border-border/80 bg-card px-4 text-callout ",
  "placeholder:text-label-tertiary focus-visible:ring-primary/15 md:text-callout",
);
export const AUTH_OTP_GROUP_CLASS = "gap-2";
export const AUTH_OTP_SLOT_CLASS = cn(
  "h-10 w-11 rounded-none border border-input text-callout  transition-colors",
  "first:rounded-l-xl last:rounded-r-xl first:border-l",
);

export function AuthPaneHeader(props: {
  titleKey: string;
  subtitleKey: string;
  variants: Variants | {};
}) {
  const { t } = useTranslation();

  return (
    <motion.div variants={props.variants} className="grid gap-2.5">
      <div className="select-none">
        <AdminFullLogo to="/login" ariaLabel="Arclayer" width={132} />
      </div>
      <div className="grid gap-2">
        <h1 className="select-none text-largetitle  text-label-primary">{t(props.titleKey)}</h1>
        <p className="select-none text-title3 font-normal  text-label-secondary text-pretty">
          {t(props.subtitleKey)}
        </p>
      </div>
    </motion.div>
  );
}

export function AuthPaneTitleRow(props: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <FieldTitle className={cn(AUTH_FIELD_TITLE_CLASS, "min-w-0")}>{props.title}</FieldTitle>
      {props.action ? <div className="shrink-0">{props.action}</div> : null}
    </div>
  );
}

export function AuthPaneLegal(props: { i18nKey: string; variants: Variants | {} }) {
  return (
    <motion.div variants={props.variants} className="pt-1.5 text-center text-balance">
      <LegalFooter i18nKey={props.i18nKey} />
    </motion.div>
  );
}
