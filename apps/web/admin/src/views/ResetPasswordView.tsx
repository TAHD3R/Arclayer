import { Button, Form, Input, Typography } from "antd";
import { Lock, KeyRound } from "lucide-react";
import { useTranslation } from "react-i18next";

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

  return (
    <div className="w-full">
      <Typography.Title level={1} style={{ marginTop: 0, marginBottom: 8, fontSize: 36 }}>
        {t("auth:RESET_PASSWORD_PAGE_TITLE")}
      </Typography.Title>
      <Typography.Paragraph
        style={{
          marginTop: 0,
          marginBottom: 26,
          color: "var(--color-muted-foreground)",
          fontSize: 15,
        }}
      >
        {t("auth:RESET_PASSWORD_PAGE_SUBTITLE")}
      </Typography.Paragraph>

      <Form<ResetPasswordFormValues>
        layout="vertical"
        requiredMark={false}
        autoComplete="off"
        initialValues={{ resetToken: initialToken ?? "" }}
        onFinish={async (values) => {
          await onSubmit({ reset_token: values.resetToken, new_password: values.newPassword });
        }}
      >
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

        <Button
          type="primary"
          htmlType="submit"
          block
          size="large"
          loading={loading}
          disabled={loading}
        >
          {t("auth:RESET_PASSWORD_BUTTON")}
        </Button>

        <div className="mt-4 text-center">
          <Button type="link" style={{ paddingInline: 0 }} onClick={onBackToLogin}>
            {t("auth:BACK_TO_LOGIN")}
          </Button>
        </div>
      </Form>
    </div>
  );
}
