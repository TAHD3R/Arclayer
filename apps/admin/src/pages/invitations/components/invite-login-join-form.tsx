import { Lock } from "lucide-react";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { AuthFieldError, AuthLinkButton, AuthPasswordControl } from "@arclayer/ui/auth-controls";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { Button } from "@arclayer/ui/button";
import { Checkbox } from "@arclayer/ui/checkbox";
import { Input } from "@arclayer/ui/input";

interface InviteLoginJoinFormProps {
  t: (key: string) => string;
  email: string;
  keepSession: boolean;
  loading: boolean;
  forgotLoading: boolean;
  onSubmit: (values: { password: string; keepSession: boolean }) => void | Promise<void>;
  onForgotPassword: () => void | Promise<void>;
  onBack: () => void;
  onBackToLogin: () => void | Promise<void>;
}

type FormValues = { password: string; keepSession: boolean };

export function InviteLoginJoinForm({
  t,
  email,
  keepSession,
  loading,
  forgotLoading,
  onSubmit,
  onForgotPassword,
  onBack,
  onBackToLogin,
}: InviteLoginJoinFormProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(
      useMemo(
        () =>
          z.object({
            password: z.string().min(1, t("auth:VALIDATION_PASSWORD_REQUIRED")),
            keepSession: z.boolean(),
          }),
        [t],
      ),
    ),
    defaultValues: { password: "", keepSession },
    mode: "onSubmit",
  });
  const currentKeepSession = Boolean(form.watch("keepSession"));

  return (
    <form
      className="grid gap-3"
      autoComplete="off"
      onSubmit={form.handleSubmit(async (values) => onSubmit(values))}
    >
      <div className="grid gap-1.5">
        <label className="text-callout font-medium text-label-primary">
          {t("invite:INVITE_FIELD_EMAIL")}
        </label>
        <Input value={email} disabled />
      </div>

      <div className="grid gap-1.5">
        <AuthPasswordControl
          autoComplete="current-password"
          aria-label={t("auth:FIELD_PASSWORD_LABEL")}
          aria-invalid={form.formState.errors.password ? true : undefined}
          placeholder={t("auth:FIELD_PASSWORD_PLACEHOLDER")}
          startIcon={<Lock size={16} />}
          disabled={loading}
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

      <div className="mb-1 flex items-center justify-between gap-3">
        <label className="flex cursor-pointer items-center gap-2">
          <Checkbox
            checked={currentKeepSession}
            onCheckedChange={(value) => form.setValue("keepSession", Boolean(value))}
          />
          <span className="text-callout">{t("auth:KEEP_SESSION")}</span>
        </label>
        <AuthLinkButton
          disabled={forgotLoading}
          onClick={() => void onForgotPassword()}
          size="sm"
          type="button"
        >
          {t("auth:FORGOT_PASSWORD")}
        </AuthLinkButton>
      </div>

      <Button className="w-full" type="submit" size="lg" loading={loading}>
        {t("invite:INVITE_ACTION_LOGIN_JOIN")}
      </Button>

      <div className="mt-4 flex items-center justify-between gap-3">
        <Button variant="outline" onClick={onBack} type="button">
          {t("invite:INVITE_ACTION_BACK")}
        </Button>
        <Button variant="outline" onClick={() => void onBackToLogin()} type="button">
          {t("invite:INVITE_ACTION_BACK_TO_LOGIN")}
        </Button>
      </div>
    </form>
  );
}
