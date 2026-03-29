import { Mail } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { motion, type Variants } from "motion/react";
import { z } from "zod";

import { zodResolver } from "@/lib/forms/zod-resolver";
import { AuthInputControl, AuthLinkButton } from "@arclayer/ui/auth-controls";
import { Button } from "@arclayer/ui/button";
import { Field, FieldContent, FieldError } from "@arclayer/ui/field";

import {
  AUTH_FIELD_CLASS,
  AUTH_INPUT_CLASS,
  AUTH_INPUT_GROUP_CLASS,
  AUTH_PANE_STACK_CLASS,
  AuthPaneHeader,
  AuthPaneTitleRow,
} from "./auth-pane-primitives";

type ForgotPasswordPaneProps = {
  onSubmit: (identifier: string) => Promise<void>;
  loading: boolean;
  onBackToLogin: () => void;
  reducedMotion: boolean;
  itemVariants: Variants;
};

type ForgotPasswordFormValues = {
  identifier: string;
};

type ForgotPasswordPaneStep = "form" | "success";

export function ForgotPasswordPane(props: ForgotPasswordPaneProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const variants = props.reducedMotion ? {} : props.itemVariants;
  const [step, setStep] = useState<ForgotPasswordPaneStep>("form");
  const form = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(
      z.object({
        identifier: z.string().min(1, t("auth:VALIDATION_ACCOUNT_REQUIRED")),
      }),
    ),
    defaultValues: { identifier: "" },
    mode: "onSubmit",
  });

  const handleSubmit = form.handleSubmit(async (values) => {
    await props.onSubmit(values.identifier);
    form.reset();
    setStep("success");
  });

  const goToReset = () => {
    void navigate({ to: "/reset-password" });
  };

  if (step === "success") {
    return (
      <div className={AUTH_PANE_STACK_CLASS}>
        <AuthPaneHeader
          titleKey="auth:FORGOT_PASSWORD_SUCCESS_TITLE"
          subtitleKey="auth:FORGOT_PASSWORD_SUCCESS_DESC"
          variants={variants}
        />
        <motion.div variants={variants} className="grid gap-3 pt-1.5">
          <Button className="w-full" type="button" size="lg" onClick={props.onBackToLogin}>
            {t("auth:BACK_TO_LOGIN")}
          </Button>
          <div className="text-center">
            <AuthLinkButton onClick={goToReset} type="button">
              {t("auth:FORGOT_PASSWORD_MODAL_HAVE_TOKEN")}
            </AuthLinkButton>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className={AUTH_PANE_STACK_CLASS}>
      <AuthPaneHeader
        titleKey="auth:FORGOT_PASSWORD_MODAL_TITLE"
        subtitleKey="auth:FORGOT_PASSWORD_MODAL_DESC"
        variants={variants}
      />
      <form className="grid gap-4" autoComplete="on" onSubmit={handleSubmit}>
        <motion.div variants={variants}>
          <Field className={AUTH_FIELD_CLASS}>
            <FieldContent className="gap-2">
              <AuthPaneTitleRow title={t("auth:FIELD_ACCOUNT_LABEL")} />
              <AuthInputControl
                autoComplete="username"
                aria-label={t("auth:FIELD_ACCOUNT_LABEL")}
                aria-invalid={form.formState.errors.identifier ? true : undefined}
                className={AUTH_INPUT_GROUP_CLASS}
                inputClassName={AUTH_INPUT_CLASS}
                placeholder={t("auth:FORGOT_PASSWORD_MODAL_FIELD_PLACEHOLDER")}
                startIcon={<Mail size={16} />}
                disabled={props.loading}
                spellCheck={false}
                {...form.register("identifier")}
              />
              <FieldError>
                {form.formState.errors.identifier?.message
                  ? String(form.formState.errors.identifier.message)
                  : undefined}
              </FieldError>
            </FieldContent>
          </Field>
        </motion.div>

        <motion.div variants={variants} className="grid gap-3 pt-1">
          <Button className="w-full" type="submit" size="lg" loading={props.loading}>
            {t("auth:FORGOT_PASSWORD_SUBMIT_BUTTON")}
          </Button>
          <div className="text-center">
            <AuthLinkButton onClick={goToReset} type="button">
              {t("auth:FORGOT_PASSWORD_MODAL_HAVE_TOKEN")}
            </AuthLinkButton>
          </div>
          <div className="text-center">
            <AuthLinkButton onClick={props.onBackToLogin} type="button">
              {t("auth:BACK_TO_LOGIN")}
            </AuthLinkButton>
          </div>
        </motion.div>
      </form>
    </div>
  );
}
