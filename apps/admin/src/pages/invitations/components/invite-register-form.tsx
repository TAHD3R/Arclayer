import { Lock, Mail, User, UserRound } from "lucide-react";
import * as React from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import {
  AuthFieldError,
  AuthInputControl,
  AuthLinkButton,
  AuthPasswordControl,
} from "@/components/ui/auth-controls";
import { AuthOauthButtons } from "@/components/ui/oauth-buttons";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { Button } from "@arclayer/ui/button";

export type InviteRegisterFormValues = {
  email?: string;
  username: string;
  displayName: string;
  password: string;
  confirmPassword: string;
};

type InviteRegisterFormState = {
  email: string | undefined;
  username: string;
  displayName: string;
  password: string;
  confirmPassword: string;
};

// Keep behavior aligned with backend PASSWORD_REGEX (apps/api/common/constants/auth.py).
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)[[A-Za-z\d~!@#$%^&*()_\-+=\]{}|;:'",.<>?/]{8,128}$/;

function createInviteRegisterSchema(t: (key: string) => string, emailLocked: boolean) {
  return z
    .object({
      email: emailLocked
        ? z.string().optional()
        : z
            .string()
            .min(1, t("auth:VALIDATION_EMAIL_REQUIRED"))
            .email(t("auth:VALIDATION_EMAIL_INVALID")),
      username: z.string().min(1, t("auth:VALIDATION_USERNAME_REQUIRED")),
      displayName: z
        .string()
        .min(1, t("setup:SETUP_VALIDATION_DISPLAY_NAME_REQUIRED"))
        .max(64, t("setup:SETUP_VALIDATION_DISPLAY_NAME_MAX")),
      password: z
        .string()
        .min(1, t("auth:VALIDATION_PASSWORD_REQUIRED"))
        .refine((value) => PASSWORD_REGEX.test(value), t("auth:PASSWORD_INVALID")),
      confirmPassword: z.string().min(1, t("auth:VALIDATION_CONFIRM_PASSWORD_REQUIRED")),
    })
    .superRefine((value, ctx) => {
      if (value.password === value.confirmPassword) return;
      ctx.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: t("auth:VALIDATION_PASSWORD_MISMATCH"),
      });
    });
}

export function InviteRegisterForm(props: {
  emailLocked?: string | null;
  loading?: boolean;
  onSubmit: (values: InviteRegisterFormValues) => void;
  onSwitchToLogin: () => void;
}) {
  const { t } = useTranslation();
  const emailLocked = Boolean(props.emailLocked);
  const form = useForm<InviteRegisterFormState>({
    resolver: zodResolver(
      React.useMemo(() => createInviteRegisterSchema(t, emailLocked), [emailLocked, t]),
    ),
    defaultValues: {
      email: props.emailLocked ?? "",
      username: "",
      displayName: "",
      password: "",
      confirmPassword: "",
    },
    mode: "onSubmit",
  });

  const submitHandler = form.handleSubmit((values) => {
    props.onSubmit(emailLocked ? { ...values, email: undefined } : values);
  });

  return (
    <div>
      {/* TODO: enable after OAuth is implemented for invite-only onboarding. */}
      <AuthOauthButtons disabled />

      <form className="grid gap-3" autoComplete="off" onSubmit={submitHandler}>
        {emailLocked ? (
          <AuthInputControl
            value={props.emailLocked ?? ""}
            disabled
            startIcon={<Mail size={16} />}
          />
        ) : (
          <div className="grid gap-1.5">
            <AuthInputControl
              autoComplete="email"
              aria-label={t("auth:FIELD_EMAIL_LABEL")}
              aria-invalid={form.formState.errors.email ? true : undefined}
              placeholder={t("auth:FIELD_EMAIL_PLACEHOLDER")}
              startIcon={<Mail size={16} />}
              disabled={props.loading}
              {...form.register("email")}
            />
            <AuthFieldError
              message={
                form.formState.errors.email?.message
                  ? String(form.formState.errors.email.message)
                  : undefined
              }
            />
          </div>
        )}

        <div className="grid gap-1.5">
          <AuthInputControl
            autoComplete="off"
            aria-label={t("auth:FIELD_USERNAME_LABEL")}
            aria-invalid={form.formState.errors.username ? true : undefined}
            placeholder={t("auth:FIELD_USERNAME_PLACEHOLDER")}
            startIcon={<User size={16} />}
            disabled={props.loading}
            {...form.register("username")}
          />
          <AuthFieldError
            message={
              form.formState.errors.username?.message
                ? String(form.formState.errors.username.message)
                : undefined
            }
          />
        </div>

        <div className="grid gap-1.5">
          <AuthInputControl
            autoComplete="off"
            aria-label={t("setup:SETUP_FIELD_DISPLAY_NAME_LABEL")}
            aria-invalid={form.formState.errors.displayName ? true : undefined}
            placeholder={t("setup:SETUP_FIELD_DISPLAY_NAME_PLACEHOLDER")}
            startIcon={<UserRound size={16} />}
            disabled={props.loading}
            {...form.register("displayName")}
          />
          <AuthFieldError
            message={
              form.formState.errors.displayName?.message
                ? String(form.formState.errors.displayName.message)
                : undefined
            }
          />
        </div>

        <div className="grid gap-1.5">
          <AuthPasswordControl
            autoComplete="new-password"
            aria-label={t("auth:FIELD_PASSWORD_LABEL")}
            aria-invalid={form.formState.errors.password ? true : undefined}
            placeholder={t("auth:FIELD_PASSWORD_PLACEHOLDER")}
            startIcon={<Lock size={16} />}
            disabled={props.loading}
            {...form.register("password")}
          />
          <AuthFieldError
            message={
              form.formState.errors.password?.message
                ? String(form.formState.errors.password.message)
                : undefined
            }
          />
        </div>

        <div className="grid gap-1.5">
          <AuthPasswordControl
            autoComplete="new-password"
            aria-label={t("auth:FIELD_CONFIRM_PASSWORD_LABEL")}
            aria-invalid={form.formState.errors.confirmPassword ? true : undefined}
            placeholder={t("auth:FIELD_CONFIRM_PASSWORD_PLACEHOLDER")}
            startIcon={<Lock size={16} />}
            disabled={props.loading}
            {...form.register("confirmPassword")}
          />
          <AuthFieldError
            message={
              form.formState.errors.confirmPassword?.message
                ? String(form.formState.errors.confirmPassword.message)
                : undefined
            }
          />
        </div>

        <Button className="w-full" type="submit" size="lg" loading={props.loading}>
          {t("invite:INVITE_ACTION_REGISTER_JOIN")}
        </Button>
      </form>

      <div className="mt-4 text-center text-label-secondary">
        <AuthLinkButton onClick={props.onSwitchToLogin} type="button">
          {t("invite:INVITE_ACTION_SWITCH_TO_LOGIN")}
        </AuthLinkButton>
      </div>
    </div>
  );
}
