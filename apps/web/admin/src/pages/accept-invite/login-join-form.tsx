import { Button, Checkbox, Form, Input } from "antd";
import { Lock } from "lucide-react";

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
  return (
    <Form<{ password: string; keepSession: boolean }>
      layout="vertical"
      requiredMark={false}
      autoComplete="off"
      initialValues={{ keepSession }}
      onFinish={onSubmit}
      disabled={loading}
    >
      <Form.Item label={t("invite:INVITE_FIELD_EMAIL")} style={{ marginBottom: 12 }}>
        <Input value={email} disabled size="large" />
      </Form.Item>

      <Form.Item
        name="password"
        rules={[{ required: true, message: t("auth:VALIDATION_PASSWORD_REQUIRED") }]}
      >
        <Input.Password
          autoComplete="current-password"
          aria-label={t("auth:FIELD_PASSWORD_LABEL")}
          placeholder={t("auth:FIELD_PASSWORD_PLACEHOLDER")}
          prefix={<Lock size={16} />}
          size="large"
        />
      </Form.Item>

      <div className="flex items-center justify-between mb-3">
        <Form.Item name="keepSession" valuePropName="checked" style={{ marginBottom: 0 }}>
          <Checkbox>{t("auth:KEEP_SESSION")}</Checkbox>
        </Form.Item>
        <Button
          type="link"
          size="small"
          style={{ paddingInline: 0 }}
          onClick={() => void onForgotPassword()}
          disabled={forgotLoading}
        >
          {t("auth:FORGOT_PASSWORD")}
        </Button>
      </div>

      <Button type="primary" htmlType="submit" block size="large" loading={loading}>
        {t("invite:INVITE_ACTION_LOGIN_JOIN")}
      </Button>

      <div className="mt-4 flex items-center justify-between">
        <Button onClick={onBack}>{t("invite:INVITE_ACTION_BACK")}</Button>
        <Button onClick={() => void onBackToLogin()}>
          {t("invite:INVITE_ACTION_BACK_TO_LOGIN")}
        </Button>
      </div>
    </Form>
  );
}
