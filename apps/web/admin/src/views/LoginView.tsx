import { Button, Checkbox, Divider, Form, Input, Modal, Space, Tabs, Typography } from "antd";
import { Chrome, Lock, Mail, User } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import { useMemo, useState } from "react";

import { notifyInfoText } from "@/core/services/notifications";

export type AuthMode = "login" | "register";

export interface LoginFormValues {
  account: string;
  password: string;
  remember: boolean;
  agree: boolean;
}

export interface RegisterFormValues {
  email: string;
  username: string;
  password: string;
  confirmPassword: string;
  agree: boolean;
}

export interface LoginViewProps {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  onLoginSubmit: (values: LoginFormValues) => void;
  onRegisterSubmit: (values: RegisterFormValues) => void;
}

export function LoginView({ mode, onModeChange, onLoginSubmit, onRegisterSubmit }: LoginViewProps) {
  const { t } = useTranslation();
  const [openModal, setOpenModal] = useState<"forgot" | "privacy" | "terms" | null>(null);

  const modalConfig = useMemo(() => {
    if (!openModal) return null;

    if (openModal === "forgot") {
      return {
        title: t("auth:FORGOT_PASSWORD_MODAL_TITLE"),
        okText: t("auth:MODAL_SUBMIT"),
        cancelText: t("auth:MODAL_CANCEL"),
        content: (
          <div className="space-y-3">
            <Typography.Paragraph style={{ margin: 0, color: "var(--color-muted-foreground)" }}>
              {t("auth:FORGOT_PASSWORD_MODAL_DESC")}
            </Typography.Paragraph>
            <Input
              size="large"
              autoComplete="off"
              aria-label={t("auth:FORGOT_PASSWORD_MODAL_FIELD_PLACEHOLDER")}
              placeholder={t("auth:FORGOT_PASSWORD_MODAL_FIELD_PLACEHOLDER")}
            />
            <Typography.Paragraph
              style={{ margin: 0, fontSize: 12, color: "var(--color-muted-foreground)" }}
            >
              {t("auth:MODAL_PLACEHOLDER_HINT")}
            </Typography.Paragraph>
          </div>
        ),
        onOk: () => {
          notifyInfoText(t("auth:FORGOT_PASSWORD_COMING_SOON"));
          setOpenModal(null);
        },
      } as const;
    }

    if (openModal === "privacy") {
      return {
        title: t("auth:PRIVACY_POLICY_MODAL_TITLE"),
        okText: t("auth:MODAL_OK"),
        cancelText: t("auth:MODAL_CANCEL"),
        content: (
          <div className="space-y-3">
            <Typography.Paragraph style={{ margin: 0 }}>
              {t("auth:PRIVACY_POLICY_MODAL_CONTENT")}
            </Typography.Paragraph>
            <Typography.Paragraph
              style={{ margin: 0, fontSize: 12, color: "var(--color-muted-foreground)" }}
            >
              {t("auth:MODAL_PLACEHOLDER_HINT")}
            </Typography.Paragraph>
          </div>
        ),
        onOk: () => setOpenModal(null),
      } as const;
    }

    return {
      title: t("auth:TERMS_OF_SERVICE_MODAL_TITLE"),
      okText: t("auth:MODAL_OK"),
      cancelText: t("auth:MODAL_CANCEL"),
      content: (
        <div className="space-y-3">
          <Typography.Paragraph style={{ margin: 0 }}>
            {t("auth:TERMS_OF_SERVICE_MODAL_CONTENT")}
          </Typography.Paragraph>
          <Typography.Paragraph
            style={{ margin: 0, fontSize: 12, color: "var(--color-muted-foreground)" }}
          >
            {t("auth:MODAL_PLACEHOLDER_HINT")}
          </Typography.Paragraph>
        </div>
      ),
      onOk: () => setOpenModal(null),
    } as const;
  }, [openModal, t]);

  return (
    <div className="w-full">
      <Modal
        open={!!openModal}
        title={modalConfig?.title}
        okText={modalConfig?.okText}
        cancelText={modalConfig?.cancelText}
        onOk={modalConfig?.onOk}
        onCancel={() => setOpenModal(null)}
        centered
        destroyOnClose
      >
        {modalConfig?.content}
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
                <Typography.Title level={1} style={{ marginTop: 0, marginBottom: 8, fontSize: 36 }}>
                  {t("auth:LOGIN_PAGE_TITLE")}
                </Typography.Title>
                <Typography.Paragraph
                  style={{
                    marginTop: 0,
                    marginBottom: 26,
                    color: "var(--color-muted-foreground)",
                    fontSize: 15,
                  }}
                >
                  {t("auth:LOGIN_PAGE_SUBTITLE")}
                </Typography.Paragraph>

                <Form<LoginFormValues>
                  layout="vertical"
                  onFinish={onLoginSubmit}
                  initialValues={{ remember: true, agree: true }}
                  requiredMark={false}
                  autoComplete="off"
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
                      name="remember"
                      valuePropName="checked"
                      style={{ marginBottom: 0 }}
                    >
                      <Checkbox>{t("auth:REMEMBER_ME")}</Checkbox>
                    </Form.Item>

                    <Button
                      type="link"
                      size="small"
                      style={{ paddingInline: 0 }}
                      onClick={() => setOpenModal("forgot")}
                    >
                      {t("auth:FORGOT_PASSWORD")}
                    </Button>
                  </div>

                  <Form.Item<LoginFormValues>
                    name="agree"
                    valuePropName="checked"
                    rules={[
                      {
                        validator: async (_, value) => {
                          if (value) return;
                          throw new Error(t("auth:VALIDATION_AGREE_REQUIRED"));
                        },
                      },
                    ]}
                    style={{ marginBottom: 14 }}
                  >
                    <Checkbox>
                      <Trans
                        i18nKey="auth:AGREE_TERMS"
                        components={{
                          privacy: (
                            <Typography.Link
                              href="#"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setOpenModal("privacy");
                              }}
                            />
                          ),
                          terms: (
                            <Typography.Link
                              href="#"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setOpenModal("terms");
                              }}
                            />
                          ),
                        }}
                      />
                    </Checkbox>
                  </Form.Item>

                  <Button type="primary" htmlType="submit" block size="large">
                    {t("auth:LOGIN_BUTTON")}
                  </Button>

                  <Divider style={{ margin: "18px 0" }}>{t("auth:OAUTH_DIVIDER")}</Divider>

                  <Space orientation="vertical" size={10} style={{ width: "100%" }}>
                    <Button
                      block
                      size="large"
                      icon={<Chrome size={18} />}
                      disabled
                      aria-label={t("auth:OAUTH_GOOGLE")}
                    >
                      {t("auth:OAUTH_GOOGLE")}
                    </Button>
                  </Space>
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
                <Typography.Title level={1} style={{ marginTop: 0, marginBottom: 8, fontSize: 36 }}>
                  {t("auth:REGISTER_PAGE_TITLE")}
                </Typography.Title>
                <Typography.Paragraph
                  style={{
                    marginTop: 0,
                    marginBottom: 26,
                    color: "var(--color-muted-foreground)",
                    fontSize: 15,
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

                  <Form.Item<RegisterFormValues>
                    name="agree"
                    valuePropName="checked"
                    rules={[
                      {
                        validator: async (_, value) => {
                          if (value) return;
                          throw new Error(t("auth:VALIDATION_AGREE_REQUIRED"));
                        },
                      },
                    ]}
                    style={{ marginBottom: 14 }}
                  >
                    <Checkbox>
                      <Trans
                        i18nKey="auth:AGREE_TERMS"
                        components={{
                          privacy: (
                            <Typography.Link
                              href="#"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setOpenModal("privacy");
                              }}
                            />
                          ),
                          terms: (
                            <Typography.Link
                              href="#"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setOpenModal("terms");
                              }}
                            />
                          ),
                        }}
                      />
                    </Checkbox>
                  </Form.Item>

                  <Button type="primary" htmlType="submit" block size="large">
                    {t("auth:REGISTER_BUTTON")}
                  </Button>

                  <Divider style={{ margin: "18px 0" }}>{t("auth:OAUTH_DIVIDER")}</Divider>

                  <Space orientation="vertical" size={10} style={{ width: "100%" }}>
                    <Button block size="large" icon={<Chrome size={18} />} disabled>
                      {t("auth:OAUTH_GOOGLE")}
                    </Button>
                  </Space>
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
