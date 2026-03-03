import { Button, Form, Input, Typography } from "antd";
import { Lock, Mail, User, UserRound } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";

import { AuthOauthButtons } from "@/components/ui/oauth-buttons";

export type InviteRegisterFormValues = {
  email?: string;
  username: string;
  displayName: string;
  password: string;
  confirmPassword: string;
};

// Keep behavior aligned with backend PASSWORD_REGEX (apps/api/common/constants/auth.py).
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)[[A-Za-z\d~!@#$%^&*()_\-+=\]{}|;:'",.<>?/]{8,128}$/;

export function InviteRegisterForm(props: {
  emailLocked?: string | null;
  loading?: boolean;
  onSubmit: (values: InviteRegisterFormValues) => void;
  onSwitchToLogin: () => void;
}) {
  const { t } = useTranslation();

  const initialValues = React.useMemo(() => {
    if (!props.emailLocked) return undefined;
    return { email: props.emailLocked };
  }, [props.emailLocked]);

  return (
    <div>
      {/* TODO: enable after OAuth is implemented for invite-only onboarding. */}
      <AuthOauthButtons disabled />

      <Form<InviteRegisterFormValues>
        layout="vertical"
        requiredMark={false}
        autoComplete="off"
        initialValues={initialValues}
        onFinish={(values) => {
          // Legacy email-bound invitations take email from server-side invitation; do not submit it.
          props.onSubmit(props.emailLocked ? { ...values, email: undefined } : values);
        }}
        disabled={props.loading}
      >
        {props.emailLocked ? (
          <Form.Item style={{ marginBottom: 12 }}>
            <Input value={props.emailLocked} disabled prefix={<Mail size={16} />} size="large" />
          </Form.Item>
        ) : (
          <Form.Item<InviteRegisterFormValues>
            name="email"
            rules={[
              { required: true, message: t("auth:VALIDATION_EMAIL_REQUIRED") },
              { type: "email", message: t("auth:VALIDATION_EMAIL_INVALID") },
            ]}
          >
            <Input
              autoComplete="email"
              aria-label={t("auth:FIELD_EMAIL_LABEL")}
              placeholder={t("auth:FIELD_EMAIL_PLACEHOLDER")}
              prefix={<Mail size={16} />}
              size="large"
            />
          </Form.Item>
        )}

        <Form.Item<InviteRegisterFormValues>
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

        <Form.Item<InviteRegisterFormValues>
          name="displayName"
          rules={[
            { required: true, message: t("setup:SETUP_VALIDATION_DISPLAY_NAME_REQUIRED") },
            { max: 64, message: t("setup:SETUP_VALIDATION_DISPLAY_NAME_MAX") },
          ]}
        >
          <Input
            autoComplete="off"
            aria-label={t("setup:SETUP_FIELD_DISPLAY_NAME_LABEL")}
            placeholder={t("setup:SETUP_FIELD_DISPLAY_NAME_PLACEHOLDER")}
            prefix={<UserRound size={16} />}
            size="large"
          />
        </Form.Item>

        <Form.Item<InviteRegisterFormValues>
          name="password"
          rules={[
            { required: true, message: t("auth:VALIDATION_PASSWORD_REQUIRED") },
            {
              validator: async (_, value) => {
                if (!value) return;
                if (PASSWORD_REGEX.test(value)) return;
                throw new Error(t("auth:PASSWORD_INVALID"));
              },
            },
          ]}
        >
          <Input.Password
            autoComplete="new-password"
            aria-label={t("auth:FIELD_PASSWORD_LABEL")}
            placeholder={t("auth:FIELD_PASSWORD_PLACEHOLDER")}
            prefix={<Lock size={16} />}
            size="large"
          />
        </Form.Item>

        <Form.Item<InviteRegisterFormValues>
          name="confirmPassword"
          dependencies={["password"]}
          rules={[
            { required: true, message: t("auth:VALIDATION_CONFIRM_PASSWORD_REQUIRED") },
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

        <Button
          type="primary"
          htmlType="submit"
          block
          size="large"
          loading={props.loading}
          autoInsertSpace={false}
        >
          {t("invite:INVITE_ACTION_REGISTER_JOIN")}
        </Button>
      </Form>

      <div className="mt-4 text-center">
        <Typography.Text style={{ color: "var(--color-muted-foreground)" }}>
          <Button
            type="link"
            style={{ paddingInline: 0 }}
            onClick={props.onSwitchToLogin}
            autoInsertSpace={false}
          >
            {t("invite:INVITE_ACTION_SWITCH_TO_LOGIN")}
          </Button>
        </Typography.Text>
      </div>
    </div>
  );
}
