import { Button, Form, Input } from "antd";
import { Lock, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import { motion, type Variants } from "motion/react";

import { AuthOauthButtons } from "@/components/ui/oauth-buttons";
import { Checkbox } from "@celestial/ui/checkbox";

import type { LoginFormValues } from "../types";

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

function KeepSessionCheckbox() {
  const { t } = useTranslation();
  const form = Form.useFormInstance<LoginFormValues>();
  const keepSession = Form.useWatch("keepSession", form) ?? false;
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <Checkbox
        checked={Boolean(keepSession)}
        onCheckedChange={(v) => form.setFieldValue("keepSession", v)}
      />
      <span className="text-callout">{t("auth:KEEP_SESSION")}</span>
    </label>
  );
}

export function LoginPane({
  onSubmit,
  loading,
  initialKeepSession,
  redirect,
  onForgotPassword,
  onSwitchToRegister,
  publicRegisterEnabled,
  reducedMotion,
  itemVariants,
}: LoginPaneProps) {
  const { t } = useTranslation();
  const v = reducedMotion ? {} : itemVariants;

  return (
    <>
      <motion.div variants={v}>
        <h1 className="text-largetitle text-label-primary">{t("auth:LOGIN_PAGE_TITLE")}</h1>
        <p className="mt-2 mb-8 text-title3 font-normal text-label-secondary">
          {t("auth:LOGIN_PAGE_SUBTITLE")}
        </p>
      </motion.div>

      <motion.div variants={v}>
        <AuthOauthButtons disabled={loading} redirect={redirect} />
      </motion.div>

      <Form<LoginFormValues>
        layout="vertical"
        onFinish={onSubmit}
        initialValues={{ keepSession: initialKeepSession }}
        requiredMark={false}
        autoComplete="off"
        disabled={loading}
      >
        <motion.div variants={v}>
          <Form.Item<LoginFormValues>
            name="account"
            rules={[{ required: true, message: t("auth:VALIDATION_ACCOUNT_REQUIRED") }]}
          >
            <Input
              autoComplete="off"
              aria-label={t("auth:FIELD_ACCOUNT_LABEL")}
              placeholder={t("auth:FIELD_ACCOUNT_PLACEHOLDER")}
              prefix={<User size={16} />}
              size="large"
            />
          </Form.Item>
        </motion.div>

        <motion.div variants={v}>
          <Form.Item<LoginFormValues>
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

        <motion.div variants={v} className="flex items-center justify-between mb-3">
          <Form.Item<LoginFormValues> name="keepSession" className="mb-0!">
            <KeepSessionCheckbox />
          </Form.Item>
          <Button
            type="link"
            size="small"
            className="px-0!"
            disabled={loading}
            onClick={onForgotPassword}
          >
            {t("auth:FORGOT_PASSWORD")}
          </Button>
        </motion.div>

        <motion.div variants={v}>
          <Button type="primary" htmlType="submit" block size="large" loading={loading}>
            {t("auth:LOGIN_BUTTON")}
          </Button>
        </motion.div>
      </Form>

      {publicRegisterEnabled ? (
        <motion.div variants={v} className="mt-4 text-center">
          <span className="text-label-secondary">
            {t("auth:NO_ACCOUNT")}{" "}
            <Button type="link" className="px-0!" onClick={onSwitchToRegister}>
              {t("auth:CREATE_ACCOUNT")}
            </Button>
          </span>
        </motion.div>
      ) : null}
    </>
  );
}
