import { Lock, User } from "lucide-react";
import { motion, type Variants } from "motion/react";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { zodResolver } from "@/lib/forms/zod-resolver";
import { AuthOauthButtons } from "@/components/ui/oauth-buttons";
import {
  AuthInputControl,
  AuthLinkButton,
  AuthPasswordControl,
} from "@/components/ui/auth-controls";
import { Checkbox } from "@arclayer/ui/checkbox";
import { Button } from "@arclayer/ui/button";
import { Field, FieldContent, FieldError } from "@arclayer/ui/field";

import type { LoginFormValues } from "../types";
import {
  AUTH_FIELD_CLASS,
  AUTH_INPUT_CLASS,
  AUTH_INPUT_GROUP_CLASS,
  AUTH_PANE_STACK_CLASS,
  AuthPaneHeader,
  AuthPaneLegal,
  AuthPaneTitleRow,
} from "./auth-pane-primitives";

type LoginPaneProps = {
  onSubmit: (values: LoginFormValues) => void;
  loading: boolean;
  initialKeepSession: boolean;
  redirect?: string;
  onForgotPassword: () => void;
  onSwitchToRegister: () => void;
  publicRegisterEnabled: boolean;
  reducedMotion: boolean;
  itemVariants: Variants;
};

type LoginPaneSectionProps = {
  variants: Variants | {};
};

type LoginPaneFormProps = LoginPaneSectionProps & {
  form: ReturnType<typeof useForm<LoginFormValues>>;
  loading: boolean;
  onSubmit: (values: LoginFormValues) => void;
  onForgotPassword: () => void;
};

function LoginPaneForm(props: LoginPaneFormProps) {
  const { t } = useTranslation();
  const keepSession = Boolean(props.form.watch("keepSession"));
  const accountError = props.form.formState.errors.account?.message;
  const passwordError = props.form.formState.errors.password?.message;

  return (
    <form
      onSubmit={props.form.handleSubmit(props.onSubmit)}
      className="grid gap-2"
      autoComplete="on"
    >
      <motion.div variants={props.variants}>
        <Field className={AUTH_FIELD_CLASS}>
          <FieldContent className="gap-2">
            <AuthPaneTitleRow title={t("auth:FIELD_ACCOUNT_LABEL")} />
            <AuthInputControl
              autoComplete="username"
              aria-label={t("auth:FIELD_ACCOUNT_LABEL")}
              aria-invalid={accountError ? true : undefined}
              className={AUTH_INPUT_GROUP_CLASS}
              inputClassName={AUTH_INPUT_CLASS}
              placeholder={t("auth:FIELD_ACCOUNT_PLACEHOLDER")}
              startIcon={<User size={16} />}
              disabled={props.loading}
              spellCheck={false}
              {...props.form.register("account")}
            />
            <FieldError>{accountError ? String(accountError) : undefined}</FieldError>
          </FieldContent>
        </Field>
      </motion.div>

      <motion.div variants={props.variants}>
        <Field className={AUTH_FIELD_CLASS}>
          <FieldContent className="gap-2">
            <AuthPaneTitleRow
              title={t("auth:FIELD_PASSWORD_LABEL")}
              action={
                <AuthLinkButton
                  disabled={props.loading}
                  onClick={props.onForgotPassword}
                  type="button"
                >
                  {t("auth:FORGOT_PASSWORD")}
                </AuthLinkButton>
              }
            />
            <AuthPasswordControl
              autoComplete="current-password"
              aria-label={t("auth:FIELD_PASSWORD_LABEL")}
              aria-invalid={passwordError ? true : undefined}
              className={AUTH_INPUT_GROUP_CLASS}
              inputClassName={AUTH_INPUT_CLASS}
              placeholder={t("auth:FIELD_PASSWORD_PLACEHOLDER")}
              startIcon={<Lock size={16} />}
              disabled={props.loading}
              {...props.form.register("password")}
            />
            <FieldError>{passwordError ? String(passwordError) : undefined}</FieldError>
          </FieldContent>
        </Field>
      </motion.div>

      <motion.div variants={props.variants} className="my-2">
        <label className="flex cursor-pointer items-center gap-2">
          <Checkbox
            checked={keepSession}
            onCheckedChange={(value) => props.form.setValue("keepSession", Boolean(value))}
          />
          <span className="text-callout">{t("auth:KEEP_SESSION")}</span>
        </label>
      </motion.div>

      <motion.div variants={props.variants} className="grid gap-3 pt-1">
        <Button className="w-full" type="submit" size="lg" loading={props.loading}>
          {t("auth:LOGIN_BUTTON")}
        </Button>
      </motion.div>
    </form>
  );
}

type LoginPaneFooterProps = LoginPaneSectionProps & {
  publicRegisterEnabled: boolean;
  onSwitchToRegister: () => void;
};

function LoginPaneFooter(props: LoginPaneFooterProps) {
  const { t } = useTranslation();

  return (
    <motion.div
      variants={props.variants}
      className="grid gap-2.5 pt-2 text-center text-label-secondary"
    >
      {props.publicRegisterEnabled ? (
        <div className="leading-6">
          <span>{t("auth:NO_ACCOUNT")} </span>
          <AuthLinkButton onClick={props.onSwitchToRegister} type="button">
            {t("auth:CREATE_ACCOUNT")}
          </AuthLinkButton>
        </div>
      ) : null}
      <AuthPaneLegal i18nKey="auth:LEGAL_LOGIN" variants={props.variants} />
    </motion.div>
  );
}

export function LoginPane(props: LoginPaneProps) {
  const { t } = useTranslation();
  const variants = props.reducedMotion ? {} : props.itemVariants;
  const schema = useMemo(
    () =>
      z.object({
        account: z.string().min(1, t("auth:VALIDATION_ACCOUNT_REQUIRED")),
        password: z.string().min(1, t("auth:VALIDATION_PASSWORD_REQUIRED")),
        keepSession: z.boolean(),
      }),
    [t],
  );
  const form = useForm<LoginFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { account: "", password: "", keepSession: props.initialKeepSession },
    mode: "onSubmit",
  });

  return (
    <div className={AUTH_PANE_STACK_CLASS}>
      <AuthPaneHeader
        titleKey="auth:LOGIN_PAGE_TITLE"
        subtitleKey="auth:LOGIN_PAGE_SUBTITLE"
        variants={variants}
      />
      <LoginPaneForm
        variants={variants}
        form={form}
        loading={props.loading}
        onSubmit={props.onSubmit}
        onForgotPassword={props.onForgotPassword}
      />
      <motion.div variants={variants} className="pt-1.5">
        <AuthOauthButtons disabled={props.loading} redirect={props.redirect} />
      </motion.div>
      <LoginPaneFooter
        variants={variants}
        publicRegisterEnabled={props.publicRegisterEnabled}
        onSwitchToRegister={props.onSwitchToRegister}
      />
    </div>
  );
}
