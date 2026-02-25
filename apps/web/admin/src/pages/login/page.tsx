import { Button, Checkbox, Form, Input, Typography } from "antd";
import { Lock, Mail, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion, type Variants } from "motion/react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AuthOauthButtons } from "@/components/common/auth-oauth-buttons";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

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
  redirect?: string | undefined;
  onForgotPassword: (identifier: string) => Promise<void>;
  onRegisterSubmit: (values: RegisterFormValues) => void;
  registerLoading?: boolean;
  publicRegisterEnabled?: boolean;
}

export function LoginView({
  mode,
  onModeChange,
  onLoginSubmit,
  loginLoading = false,
  initialKeepSession = false,
  redirect,
  onForgotPassword,
  onRegisterSubmit,
  registerLoading = false,
  publicRegisterEnabled = true,
}: LoginViewProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const reducedMotion = usePrefersReducedMotion();
  const prevModeRef = useRef<AuthMode>(mode);
  const direction =
    mode === prevModeRef.current
      ? 0
      : mode === "register" && prevModeRef.current === "login"
        ? 1
        : -1;
  const enterOffsetX = direction > 0 ? 8 : direction < 0 ? -8 : 0;
  const exitOffsetX = direction > 0 ? -8 : direction < 0 ? 8 : 0;
  const [openModal, setOpenModal] = useState<"forgot" | null>(null);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotForm] = Form.useForm<{ identifier: string }>();

  useEffect(() => {
    prevModeRef.current = mode;
  }, [mode]);

  const transition = reducedMotion
    ? ({ duration: 0 } as const)
    : ({ duration: 0.18, ease: [0.2, 0, 0, 1] as const } as const);

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 8 },
    show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
    exit: { opacity: 0, y: -4, transition: { duration: 0.12 } },
  };

  const resolvedMode: AuthMode = publicRegisterEnabled ? mode : "login";

  const loginPane = (
    <>
      <motion.div variants={reducedMotion ? {} : itemVariants}>
        <div className="text-largetitle text-label-primary mb-2">{t("auth:LOGIN_PAGE_TITLE")}</div>
        <div className="text-title2 text-label-secondary mb-6">{t("auth:LOGIN_PAGE_SUBTITLE")}</div>
      </motion.div>

      <Form<LoginFormValues>
        layout="vertical"
        onFinish={onLoginSubmit}
        initialValues={{ keepSession: initialKeepSession }}
        requiredMark={false}
        autoComplete="off"
        disabled={loginLoading}
      >
        <motion.div variants={reducedMotion ? {} : itemVariants}>
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

        <motion.div variants={reducedMotion ? {} : itemVariants}>
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

        <motion.div
          variants={reducedMotion ? {} : itemVariants}
          className="flex items-center justify-between mb-3"
        >
          <Form.Item<LoginFormValues> name="keepSession" valuePropName="checked" className="mb-0!">
            <Checkbox>{t("auth:KEEP_SESSION")}</Checkbox>
          </Form.Item>

          <Button
            type="link"
            size="small"
            className="px-0!"
            disabled={loginLoading}
            onClick={() => setOpenModal("forgot")}
          >
            {t("auth:FORGOT_PASSWORD")}
          </Button>
        </motion.div>

        <motion.div variants={reducedMotion ? {} : itemVariants}>
          <Button type="primary" htmlType="submit" block size="large" loading={loginLoading}>
            {t("auth:LOGIN_BUTTON")}
          </Button>
        </motion.div>

        <motion.div variants={reducedMotion ? {} : itemVariants}>
          <AuthOauthButtons disabled={loginLoading} redirect={redirect} />
        </motion.div>
      </Form>

      {publicRegisterEnabled ? (
        <motion.div variants={reducedMotion ? {} : itemVariants} className="mt-4 text-center">
          <Typography.Text className="text-label-secondary">
            {t("auth:NO_ACCOUNT")}{" "}
            <Button type="link" className="px-0!" onClick={() => onModeChange("register")}>
              {t("auth:CREATE_ACCOUNT")}
            </Button>
          </Typography.Text>
        </motion.div>
      ) : null}
    </>
  );

  const registerPane = (
    <>
      <motion.div variants={reducedMotion ? {} : itemVariants}>
        <div className="text-largetitle text-label-primary mb-1">
          {t("auth:REGISTER_PAGE_TITLE")}
        </div>
        <div className="text-title2 text-label-secondary mb-6">
          {t("auth:REGISTER_PAGE_SUBTITLE")}
        </div>
      </motion.div>

      <Form<RegisterFormValues>
        layout="vertical"
        onFinish={onRegisterSubmit}
        requiredMark={false}
        autoComplete="off"
        disabled={registerLoading}
      >
        <motion.div variants={reducedMotion ? {} : itemVariants}>
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

        <motion.div variants={reducedMotion ? {} : itemVariants}>
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

        <motion.div variants={reducedMotion ? {} : itemVariants}>
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

        <motion.div variants={reducedMotion ? {} : itemVariants}>
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
        </motion.div>

        <motion.div variants={reducedMotion ? {} : itemVariants}>
          <Button type="primary" htmlType="submit" block size="large" loading={registerLoading}>
            {t("auth:REGISTER_BUTTON")}
          </Button>
        </motion.div>

        <motion.div variants={reducedMotion ? {} : itemVariants}>
          <AuthOauthButtons disabled={registerLoading} redirect={redirect} />
        </motion.div>
      </Form>

      <motion.div variants={reducedMotion ? {} : itemVariants} className="mt-4 text-center">
        <Typography.Text className="text-label-secondary">
          {t("auth:HAVE_ACCOUNT")}{" "}
          <Button type="link" className="px-0!" onClick={() => onModeChange("login")}>
            {t("auth:SIGN_IN")}
          </Button>
        </Typography.Text>
      </motion.div>
    </>
  );

  return (
    <div className="w-full">
      <Dialog
        open={openModal === "forgot"}
        onOpenChange={(open) => {
          if (!open) {
            setOpenModal(null);
            if (!forgotLoading) {
              forgotForm.resetFields();
            }
          }
        }}
      >
        <DialogContent
          className="sm:max-w-100"
          onInteractOutside={(e) => {
            if (forgotLoading) {
              e.preventDefault();
            }
          }}
          onEscapeKeyDown={(e) => {
            if (forgotLoading) {
              e.preventDefault();
            }
          }}
          showCloseButton={!forgotLoading}
        >
          <DialogHeader>
            <DialogTitle>{t("auth:FORGOT_PASSWORD_MODAL_TITLE")}</DialogTitle>
          </DialogHeader>
          <motion.div
            initial="hidden"
            animate="show"
            variants={{
              show: { transition: { staggerChildren: 0.05, delayChildren: 0.1 } },
            }}
            className="flex flex-col gap-y-3"
          >
            <motion.div variants={reducedMotion ? {} : itemVariants} className="space-y-3">
              <DialogDescription className="text-callout text-label-secondary">
                {t("auth:FORGOT_PASSWORD_MODAL_DESC")}
              </DialogDescription>
            </motion.div>
            <motion.div variants={reducedMotion ? {} : itemVariants}>
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
                  className="mb-0!"
                >
                  <Input
                    size="large"
                    autoComplete="off"
                    aria-label={t("auth:FORGOT_PASSWORD_MODAL_FIELD_PLACEHOLDER")}
                    placeholder={t("auth:FORGOT_PASSWORD_MODAL_FIELD_PLACEHOLDER")}
                    prefix={<Mail size={16} />}
                    disabled={forgotLoading}
                  />
                </Form.Item>
              </Form>

              <div className="mt-2 text-center">
                <Button
                  type="link"
                  className="px-0!"
                  disabled={forgotLoading}
                  onClick={() => {
                    setOpenModal(null);
                    void navigate({ to: "/reset-password" });
                  }}
                >
                  {t("auth:FORGOT_PASSWORD_MODAL_HAVE_TOKEN")}
                </Button>
              </div>
            </motion.div>

            <motion.div variants={reducedMotion ? {} : itemVariants}>
              <DialogFooter>
                <Button type="text" disabled={forgotLoading} onClick={() => setOpenModal(null)}>
                  {t("auth:MODAL_CANCEL")}
                </Button>
                <Button type="primary" loading={forgotLoading} onClick={() => forgotForm.submit()}>
                  {t("auth:MODAL_SUBMIT")}
                </Button>
              </DialogFooter>
            </motion.div>
          </motion.div>
        </DialogContent>
      </Dialog>

      <MotionConfig transition={transition}>
        <div className="relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={resolvedMode}
              initial="hidden"
              animate="show"
              exit="exit"
              variants={{
                hidden: reducedMotion ? { opacity: 1 } : { opacity: 0, x: enterOffsetX },
                show: reducedMotion
                  ? { opacity: 1 }
                  : {
                      opacity: 1,
                      x: 0,
                      transition: { staggerChildren: 0.05, delayChildren: 0.02 },
                    },
                exit: reducedMotion ? { opacity: 1 } : { opacity: 0, x: exitOffsetX },
              }}
            >
              {resolvedMode === "login" ? loginPane : registerPane}
            </motion.div>
          </AnimatePresence>
        </div>
      </MotionConfig>
    </div>
  );
}
