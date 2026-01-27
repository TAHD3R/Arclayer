import { Alert, Button, Checkbox, Divider, Form, Input, Modal, Tabs, Typography } from "antd";
import { Lock, Mail, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { AuthOauthButtons } from "@/components/app/authOauthButtons";

export type AuthMode = "login" | "register";

export interface LoginFormValues {
  account: string;
  password: string;
  keepSession: boolean;
}

export interface RegisterFormValues {
  email: string;
  username: string;
  password: string;
  confirmPassword: string;
}

export interface LoginViewProps {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  onLoginSubmit: (values: LoginFormValues) => void;
  loginLoading?: boolean;
  initialKeepSession?: boolean;
  onForgotPassword: (identifier: string) => Promise<void>;
  onRegisterSubmit: (values: RegisterFormValues) => void;
}

export function LoginView({
  mode,
  onModeChange,
  onLoginSubmit,
  loginLoading = false,
  initialKeepSession = false,
  onForgotPassword,
  onRegisterSubmit,
}: LoginViewProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [openModal, setOpenModal] = useState<"forgot" | null>(null);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotForm] = Form.useForm<{ identifier: string }>();

  return (
    <div className="w-full">
      <Modal
        open={openModal === "forgot"}
        title={t("auth:FORGOT_PASSWORD_MODAL_TITLE")}
        okText={t("auth:MODAL_SUBMIT")}
        cancelText={t("auth:MODAL_CANCEL")}
        confirmLoading={forgotLoading}
        onOk={() => forgotForm.submit()}
        onCancel={() => setOpenModal(null)}
        centered
        destroyOnHidden
      >
        <div className="space-y-3">
          <Alert type="info" showIcon title={t("auth:FORGOT_PASSWORD_MODAL_HINT")} />
          <Typography.Paragraph
            style={{ marginTop: 0, marginBottom: 0, color: "var(--color-muted-foreground)" }}
          >
            {t("auth:FORGOT_PASSWORD_MODAL_DESC")}
          </Typography.Paragraph>
        </div>
        <Form
          form={forgotForm}
          layout="vertical"
          requiredMark={false}
          autoComplete="off"
          onFinish={async (values) => {
            setForgotLoading(true);
            try {
              await onForgotPassword(values.identifier);
              setOpenModal(null);
              forgotForm.resetFields();
            } finally {
              setForgotLoading(false);
            }
          }}
        >
          <Form.Item
            name="identifier"
            rules={[{ required: true, message: t("auth:VALIDATION_ACCOUNT_REQUIRED") }]}
            style={{ marginTop: 12, marginBottom: 0 }}
          >
            <Input
              size="large"
              autoComplete="off"
              aria-label={t("auth:FORGOT_PASSWORD_MODAL_FIELD_PLACEHOLDER")}
              placeholder={t("auth:FORGOT_PASSWORD_MODAL_FIELD_PLACEHOLDER")}
              prefix={<Mail size={16} />}
            />
          </Form.Item>
        </Form>

        <div className="mt-2 text-center">
          <Button
            type="link"
            size="small"
            style={{ paddingInline: 0 }}
            onClick={() => {
              setOpenModal(null);
              void navigate({ to: "/reset-password" });
            }}
          >
            {t("auth:FORGOT_PASSWORD_MODAL_HAVE_TOKEN")}
          </Button>
        </div>
      </Modal>

      <Tabs
        activeKey={mode}
        renderTabBar={(props, DefaultTabBar) => (
          <DefaultTabBar {...props} style={{ display: "none" }} />
        )}
        items={[
          {
            key: "login",
            label: "login",
            children: (
              <>
                <Typography.Title level={1} style={{ marginTop: 0, marginBottom: 8, fontSize: 32 }}>
                  {t("auth:LOGIN_PAGE_TITLE")}
                </Typography.Title>
                <Typography.Paragraph
                  style={{
                    marginTop: 0,
                    marginBottom: 26,
                    color: "var(--color-muted-foreground)",
                    fontSize: 18,
                  }}
                >
                  {t("auth:LOGIN_PAGE_SUBTITLE")}
                </Typography.Paragraph>

                <Form<LoginFormValues>
                  layout="vertical"
                  onFinish={onLoginSubmit}
                  initialValues={{ keepSession: initialKeepSession }}
                  requiredMark={false}
                  autoComplete="off"
                  disabled={loginLoading}
                >
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

                  <div className="flex items-center justify-between mb-3">
                    <Form.Item<LoginFormValues>
                      name="keepSession"
                      valuePropName="checked"
                      style={{ marginBottom: 0 }}
                    >
                      <Checkbox>{t("auth:KEEP_SESSION")}</Checkbox>
                    </Form.Item>

                    <Button
                      type="link"
                      size="small"
                      style={{ paddingInline: 0 }}
                      disabled={loginLoading}
                      onClick={() => setOpenModal("forgot")}
                    >
                      {t("auth:FORGOT_PASSWORD")}
                    </Button>
                  </div>

                  <Button
                    type="primary"
                    htmlType="submit"
                    block
                    size="large"
                    loading={loginLoading}
                  >
                    {t("auth:LOGIN_BUTTON")}
                  </Button>

                  <Divider style={{ margin: "18px 0" }}>{t("auth:OAUTH_DIVIDER")}</Divider>

                  <AuthOauthButtons disabled />
                </Form>

                <div className="mt-4 text-center">
                  <Typography.Text style={{ color: "var(--color-muted-foreground)" }}>
                    {t("auth:NO_ACCOUNT")}{" "}
                    <Button
                      type="link"
                      style={{ paddingInline: 0 }}
                      onClick={() => onModeChange("register")}
                    >
                      {t("auth:CREATE_ACCOUNT")}
                    </Button>
                  </Typography.Text>
                </div>
              </>
            ),
          },
          {
            key: "register",
            label: "register",
            children: (
              <>
                <Typography.Title level={1} style={{ marginTop: 0, marginBottom: 8, fontSize: 32 }}>
                  {t("auth:REGISTER_PAGE_TITLE")}
                </Typography.Title>
                <Typography.Paragraph
                  style={{
                    marginTop: 0,
                    marginBottom: 26,
                    color: "var(--color-muted-foreground)",
                    fontSize: 18,
                  }}
                >
                  {t("auth:REGISTER_PAGE_SUBTITLE")}
                </Typography.Paragraph>

                <Form<RegisterFormValues>
                  layout="vertical"
                  onFinish={onRegisterSubmit}
                  requiredMark={false}
                  autoComplete="off"
                >
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

                  <Form.Item<RegisterFormValues>
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

                  <Button type="primary" htmlType="submit" block size="large">
                    {t("auth:REGISTER_BUTTON")}
                  </Button>

                  <Divider style={{ margin: "18px 0" }}>{t("auth:OAUTH_DIVIDER")}</Divider>

                  <AuthOauthButtons disabled />
                </Form>

                <div className="mt-4 text-center">
                  <Typography.Text style={{ color: "var(--color-muted-foreground)" }}>
                    {t("auth:HAVE_ACCOUNT")}{" "}
                    <Button
                      type="link"
                      style={{ paddingInline: 0 }}
                      onClick={() => onModeChange("login")}
                    >
                      {t("auth:SIGN_IN")}
                    </Button>
                  </Typography.Text>
                </div>
              </>
            ),
          },
        ]}
      />
    </div>
  );
}
