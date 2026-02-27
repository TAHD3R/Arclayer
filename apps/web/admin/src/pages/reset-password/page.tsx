import { Button as AntButton, Form, Input } from "antd";
import { Lock, KeyRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { motion, type Variants } from "motion/react";

import * as authApi from "@/api/auth";
import { notifySuccessText } from "@/lib/notifications";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

const PASSWORD_PATTERN =
  /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d~!@#$%^&*()_\-+=[\]{}|;:'",.<>?/]{8,128}$/;

export interface ResetPasswordFormValues {
  resetToken: string;
  newPassword: string;
  confirmPassword: string;
}

export interface ResetPasswordViewProps {
  initialToken?: string;
  loading?: boolean;
  onSubmit: (values: { reset_token: string; new_password: string }) => Promise<void>;
  onBackToLogin: () => void;
}

export function ResetPasswordView({
  initialToken,
  loading = false,
  onSubmit,
  onBackToLogin,
}: ResetPasswordViewProps) {
  const { t } = useTranslation();
  const reducedMotion = usePrefersReducedMotion();

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 8 },
    show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
  };

  const v = reducedMotion ? {} : itemVariants;

  return (
    <motion.div
      className="w-full"
      initial="hidden"
      animate="show"
      variants={{
        show: reducedMotion ? {} : { transition: { staggerChildren: 0.05 } },
      }}
    >
      <motion.div variants={v}>
        <h1 className="text-largetitle text-label-primary">
          {t("auth:RESET_PASSWORD_PAGE_TITLE")}
        </h1>
        <p className="mt-2 mb-8 text-title2 text-label-secondary">
          {t("auth:RESET_PASSWORD_PAGE_SUBTITLE")}
        </p>
      </motion.div>

      <Form<ResetPasswordFormValues>
        layout="vertical"
        requiredMark={false}
        autoComplete="off"
        initialValues={{ resetToken: initialToken ?? "" }}
        onFinish={async (values) => {
          await onSubmit({ reset_token: values.resetToken, new_password: values.newPassword });
        }}
      >
        <motion.div variants={v}>
          <Form.Item<ResetPasswordFormValues>
            name="resetToken"
            rules={[{ required: true, message: t("auth:VALIDATION_RESET_TOKEN_REQUIRED") }]}
          >
            <Input
              size="large"
              autoComplete="off"
              aria-label={t("auth:FIELD_RESET_TOKEN_LABEL")}
              placeholder={t("auth:FIELD_RESET_TOKEN_PLACEHOLDER")}
              prefix={<KeyRound size={16} />}
            />
          </Form.Item>
        </motion.div>

        <motion.div variants={v}>
          <Form.Item<ResetPasswordFormValues>
            name="newPassword"
            validateFirst
            rules={[
              { required: true, message: t("auth:VALIDATION_PASSWORD_REQUIRED") },
              {
                pattern: PASSWORD_PATTERN,
                message: t("auth:PASSWORD_INVALID"),
              },
            ]}
          >
            <Input.Password
              size="large"
              autoComplete="new-password"
              aria-label={t("auth:FIELD_NEW_PASSWORD_LABEL")}
              placeholder={t("auth:FIELD_NEW_PASSWORD_PLACEHOLDER")}
              prefix={<Lock size={16} />}
            />
          </Form.Item>
        </motion.div>

        <motion.div variants={v}>
          <Form.Item<ResetPasswordFormValues>
            name="confirmPassword"
            dependencies={["newPassword"]}
            rules={[
              { required: true, message: t("auth:VALIDATION_CONFIRM_PASSWORD_REQUIRED") },
              ({ getFieldValue }) => ({
                validator: async (_, value) => {
                  const pwd = getFieldValue("newPassword");
                  if (!value || value === pwd) return;
                  throw new Error(t("auth:VALIDATION_PASSWORD_MISMATCH"));
                },
              }),
            ]}
          >
            <Input.Password
              size="large"
              autoComplete="new-password"
              aria-label={t("auth:FIELD_CONFIRM_PASSWORD_LABEL")}
              placeholder={t("auth:FIELD_CONFIRM_PASSWORD_PLACEHOLDER")}
              prefix={<Lock size={16} />}
            />
          </Form.Item>
        </motion.div>

        <motion.div variants={v}>
          <AntButton
            type="primary"
            htmlType="submit"
            block
            size="large"
            loading={loading}
            disabled={loading}
          >
            {t("auth:RESET_PASSWORD_BUTTON")}
          </AntButton>

          <div className="mt-4 text-center">
            <AntButton type="link" style={{ paddingInline: 0 }} onClick={onBackToLogin}>
              {t("auth:BACK_TO_LOGIN")}
            </AntButton>
          </div>
        </motion.div>
      </Form>
    </motion.div>
  );
}

// --- Route-level container (wires mutations and navigation to the presentational view) ---

const resetPasswordRouteApi = getRouteApi("/reset-password/");

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { token } = resetPasswordRouteApi.useSearch();

  const resetMutation = useMutation({
    mutationFn: async (values: { reset_token: string; new_password: string }) =>
      authApi.resetPassword(values),
  });

  return (
    <ResetPasswordView
      initialToken={token}
      loading={resetMutation.isPending}
      onSubmit={async (values) => {
        try {
          await resetMutation.mutateAsync(values);
          notifySuccessText(t("auth:RESET_SUCCESS"));
          void navigate({ to: "/login", search: { mode: "login" } });
        } catch {
          // Error toast is handled globally by TanStack Query's MutationCache onError.
        }
      }}
      onBackToLogin={() => {
        void navigate({ to: "/login", search: { mode: "login" } });
      }}
    />
  );
}
