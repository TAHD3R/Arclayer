import { motion, type Variants } from "motion/react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { AdminFullLogo } from "@/components/layout/admin-logo";
import { LegalFooter } from "@/components/layout/legal-footer";
import { cn } from "@celestial/lib/utils";
import { FieldTitle } from "@celestial/ui/field";

export const AUTH_FIELD_CLASS = "gap-2";
export const AUTH_FIELD_TITLE_CLASS = "text-headline text-label-primary";
export const AUTH_INPUT_GROUP_CLASS = cn(
  "h-10 rounded-xl border-border/80 bg-background shadow-none",
  "has-[[data-slot=input-group-control]:focus-visible]:border-primary",
  "has-[[data-slot=input-group-control]:focus-visible]:ring-primary/15",
);
export const AUTH_INPUT_CLASS =
  "h-10 px-0 text-callout placeholder:text-label-tertiary md:text-callout";
export const AUTH_PLAIN_INPUT_CLASS = cn(
  "h-10 rounded-xl border-border/80 bg-background px-4 text-callout shadow-none",
  "placeholder:text-label-tertiary focus-visible:ring-primary/15 md:text-callout",
);
export const AUTH_OTP_GROUP_CLASS = "gap-2";
export const AUTH_OTP_SLOT_CLASS = cn(
  "h-10 w-11 rounded-none border border-input text-callout shadow-none transition-colors",
  "first:rounded-l-xl last:rounded-r-xl first:border-l",
);

export function AuthPaneHeader(props: {
  titleKey: string;
  subtitleKey: string;
  variants: Variants | {};
}) {
  const { t } = useTranslation();

  return (
    <motion.div variants={props.variants} className="grid gap-3">
      <div className="select-none">
        <AdminFullLogo to="/login" ariaLabel="Arclayer" width={132} />
      </div>
      <div>
        <h1 className="select-none text-largetitle text-label-primary">{t(props.titleKey)}</h1>
        <p className="mt-2.5 max-w-[34ch] select-none text-title3 font-normal text-label-secondary">
          {t(props.subtitleKey)}
        </p>
      </div>
    </motion.div>
  );
}

export function AuthPaneTitleRow(props: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <FieldTitle className={AUTH_FIELD_TITLE_CLASS}>{props.title}</FieldTitle>
      {props.action}
    </div>
  );
}

export function AuthPaneLegal(props: { i18nKey: string; variants: Variants | {} }) {
  return (
    <motion.div variants={props.variants} className="pt-2 text-center">
      <LegalFooter i18nKey={props.i18nKey} />
    </motion.div>
  );
}
