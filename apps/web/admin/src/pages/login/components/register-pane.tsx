import { Button, Form, Input } from "antd";
import { Lock, Mail, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import { motion, type Variants } from "motion/react";

import { AuthOauthButtons } from "@/components/auth/auth-oauth-buttons";

import type { RegisterFormValues } from "../types";

type RegisterPaneProps = {
  onSubmit: (values: RegisterFormValues) => void;
  loading: boolean;
  redirect?: string;
  onSwitchToLogin: () => void;
  reducedMotion: boolean;
  itemVariants: Variants;
};

export function RegisterPane({
  onSubmit,
  loading,
  redirect,
  onSwitchToLogin,
  reducedMotion,
  itemVariants,
}: RegisterPaneProps) {
  const { t } = useTranslation();
  const v = reducedMotion ? {} : itemVariants;

  return (
    <>
      <motion.div variants={v}>
        <h1 className="text-largetitle text-label-primary">{t("auth:REGISTER_PAGE_TITLE")}</h1>
        <p className="mt-2 mb-8 text-title2 text-label-secondary">
          {t("auth:REGISTER_PAGE_SUBTITLE")}
        </p>
      </motion.div>

      <motion.div variants={v}>
        <AuthOauthButtons disabled={loading} redirect={redirect} />
      </motion.div>

      <Form<RegisterFormValues>
        layout="vertical"
        onFinish={onSubmit}
        requiredMark={false}
        autoComplete="off"
        disabled={loading}
      >
        <motion.div variants={v}>
          <Form.Item<RegisterFormValues>
            name="email"
            rules={[
              { required: true, message: t("auth:VALIDATION_EMAIL_REQUIRED") },
              { type: "email", message: t("auth:VALIDATION_EMAIL_INVALID") },
            ]}
          >
            <Input
              autoComplete="off"
              aria-label={t("auth:FIELD_EMAIL_LABEL")}
              placeholder={t("auth:FIELD_EMAIL_PLACEHOLDER")}
              prefix={<Mail size={16} />}
              size="large"
            />
          </Form.Item>
        </motion.div>

        <motion.div variants={v}>
          <Form.Item<RegisterFormValues>
            name="username"
            rules={[{ required: true, message: t("auth:VALIDATION_USERNAME_REQUIRED") }]}
          >
            <Input
              autoComplete="off"
              aria-label={t("auth:FIELD_USERNAME_LABEL")}
              placeholder={t("auth:FIELD_USERNAME_PLACEHOLDER")}
              prefix={<User size={16} />}
              size="large"
            />
          </Form.Item>
        </motion.div>

        <motion.div variants={v}>
          <Form.Item<RegisterFormValues>
            name="password"
            rules={[{ required: true, message: t("auth:VALIDATION_PASSWORD_REQUIRED") }]}
          >
            <Input.Password
              autoComplete="new-password"
              aria-label={t("auth:FIELD_PASSWORD_LABEL")}
              placeholder={t("auth:FIELD_PASSWORD_PLACEHOLDER")}
              prefix={<Lock size={16} />}
              size="large"
            />
          </Form.Item>
        </motion.div>

        <motion.div variants={v}>
          <Form.Item<RegisterFormValues>
            name="confirmPassword"
            dependencies={["password"]}
            rules={[
              {
                required: true,
                message: t("auth:VALIDATION_CONFIRM_PASSWORD_REQUIRED"),
              },
              ({ getFieldValue }) => ({
                validator: async (_, value) => {
                  const pwd = getFieldValue("password");
                  if (!value || value === pwd) return;
                  throw new Error(t("auth:VALIDATION_PASSWORD_MISMATCH"));
                },
              }),
            ]}
          >
            <Input.Password
              autoComplete="new-password"
              aria-label={t("auth:FIELD_CONFIRM_PASSWORD_LABEL")}
              placeholder={t("auth:FIELD_CONFIRM_PASSWORD_PLACEHOLDER")}
              prefix={<Lock size={16} />}
              size="large"
            />
          </Form.Item>
        </motion.div>

        <motion.div variants={v}>
          <Button type="primary" htmlType="submit" block size="large" loading={loading}>
            {t("auth:REGISTER_BUTTON")}
          </Button>
        </motion.div>
      </Form>

      <motion.div variants={v} className="mt-4 text-center">
        <span className="text-label-secondary">
          {t("auth:HAVE_ACCOUNT")}{" "}
          <Button type="link" className="px-0!" onClick={onSwitchToLogin}>
            {t("auth:SIGN_IN")}
          </Button>
        </span>
      </motion.div>
    </>
  );
}
