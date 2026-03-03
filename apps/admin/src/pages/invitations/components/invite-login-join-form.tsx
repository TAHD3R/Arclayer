import { Button, Form, Input } from "antd";
import { Lock } from "lucide-react";

import { Checkbox } from "@celestial/ui/checkbox";

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

function KeepSessionCheckbox({ t }: { t: (key: string) => string }) {
  const form = Form.useFormInstance<FormValues>();
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
    <Form<FormValues>
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
        <Form.Item name="keepSession" style={{ marginBottom: 0 }}>
          <KeepSessionCheckbox t={t} />
        </Form.Item>
        <Button
          type="link"
          size="small"
          style={{ paddingInline: 0 }}
          onClick={() => void onForgotPassword()}
          disabled={forgotLoading}
          autoInsertSpace={false}
        >
          {t("auth:FORGOT_PASSWORD")}
        </Button>
      </div>

      <Button
        type="primary"
        htmlType="submit"
        block
        size="large"
        loading={loading}
        autoInsertSpace={false}
      >
        {t("invite:INVITE_ACTION_LOGIN_JOIN")}
      </Button>

      <div className="mt-4 flex items-center justify-between">
        <Button onClick={onBack} autoInsertSpace={false}>
          {t("invite:INVITE_ACTION_BACK")}
        </Button>
        <Button onClick={() => void onBackToLogin()} autoInsertSpace={false}>
          {t("invite:INVITE_ACTION_BACK_TO_LOGIN")}
        </Button>
      </div>
    </Form>
  );
}
