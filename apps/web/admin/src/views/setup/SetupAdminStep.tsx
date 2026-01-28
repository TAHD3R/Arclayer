import { Button, Form, Input } from "antd";
import { Lock, Mail, User } from "lucide-react";
import { useTranslation } from "react-i18next";

import { type SetupAdminDraft } from "@/stores/useSetupWizardStore";

// Keep behavior aligned with backend PASSWORD_REGEX (apps/api/routers/v1/auth/constants.py).
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)[[A-Za-z\d~!@#$%^&*()_\-+=\]{}|;:'",.<>?/]{8,128}$/;

export function SetupAdminStep(props: {
  form: ReturnType<typeof Form.useForm<SetupAdminDraft>>[0];
  disabled?: boolean;
  onValuesChange: (changed: Partial<SetupAdminDraft>, values: Partial<SetupAdminDraft>) => void;
}) {
  const { t } = useTranslation();

  return (
    <Form<SetupAdminDraft>
      form={props.form}
      layout="vertical"
      requiredMark={false}
      autoComplete="off"
      disabled={props.disabled}
      onValuesChange={props.onValuesChange}
    >
      <Form.Item<SetupAdminDraft>
        name="username"
        label={t("auth:FIELD_USERNAME_LABEL")}
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

      <Form.Item<SetupAdminDraft>
        name="password"
        label={t("auth:FIELD_PASSWORD_LABEL")}
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

      <Form.Item<SetupAdminDraft>
        name="confirmPassword"
        label={t("auth:FIELD_CONFIRM_PASSWORD_LABEL")}
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

      <Form.Item<SetupAdminDraft>
        name="email"
        label={t("auth:FIELD_EMAIL_LABEL")}
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

      <Form.Item<SetupAdminDraft>
        name="displayName"
        label={t("common:SETUP_FIELD_DISPLAY_NAME_LABEL")}
        rules={[
          { required: true, message: t("common:SETUP_VALIDATION_DISPLAY_NAME_REQUIRED") },
          { max: 64, message: t("common:SETUP_VALIDATION_DISPLAY_NAME_MAX") },
        ]}
      >
        <Input
          autoComplete="off"
          aria-label={t("common:SETUP_FIELD_DISPLAY_NAME_LABEL")}
          placeholder={t("common:SETUP_FIELD_DISPLAY_NAME_PLACEHOLDER")}
          size="large"
        />
      </Form.Item>

      {/* Prevent Enter key from submitting/navigating unexpectedly (we drive navigation from the wizard buttons). */}
      <Button htmlType="submit" style={{ display: "none" }} />
    </Form>
  );
}
