import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Alert, Button, Form, Input } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import * as authApi from "@/api/auth";
import { SettingDialog } from "@celestial/ui/setting-dialog";
import { SettingVerticalItem } from "@celestial/ui/setting-vertical-item";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { useAuthStore } from "@/stores/use-auth-store";

export type MeProfileDangerSectionProps = {
  email: string | null;
};

type DeleteAccountFormValues = {
  email: string;
  password: string;
};

export function MeProfileDangerSection(props: MeProfileDangerSectionProps) {
  const { t } = useTranslation(["account", "auth", "settings", "common"]);
  const navigate = useNavigate();
  const clearAuth = useAuthStore((s) => s.clear);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<DeleteAccountFormValues>();

  const normalizedEmail = useMemo(
    () => (props.email ? String(props.email).trim() : ""),
    [props.email],
  );

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({ email: "", password: "" });
  }, [form, open]);

  const deleteMutation = useMutation({
    mutationFn: async (values: { email: string; password: string }) => {
      return authApi.deleteMyAccount({ email: values.email, password: values.password });
    },
    onSuccess: async () => {
      notifySuccessText(t("account:ME_DELETE_ACCOUNT_SUCCESS"));
      clearAuth();
      setOpen(false);
      form.resetFields();
      await navigate({ to: "/login", replace: true });
    },
    onError: (err) => notifyError(err),
  });

  const canSubmit = useMemo(() => !deleteMutation.isPending, [deleteMutation.isPending]);

  return (
    <>
      <div className="flex flex-col gap-8">
        <SettingVerticalItem
          title={t("account:ME_DELETE_ACCOUNT_TITLE")}
          description={t("account:ME_DELETE_ACCOUNT_DESC")}
          control={
            <Button danger type="primary" onClick={() => setOpen(true)}>
              {t("account:ME_DELETE_ACCOUNT_ACTION")}
            </Button>
          }
        />
      </div>

      <SettingDialog
        open={open}
        onOpenChange={(next) => {
          if (!next) form.resetFields();
          setOpen(next);
        }}
        title={t("account:ME_DELETE_ACCOUNT_DIALOG_TITLE")}
        description={t("account:ME_DELETE_ACCOUNT_DIALOG_DESC")}
        footer={
          <>
            <Button type="text" disabled={deleteMutation.isPending} onClick={() => setOpen(false)}>
              {t("common:CANCEL")}
            </Button>
            <Button
              danger
              type="primary"
              disabled={!canSubmit}
              loading={deleteMutation.isPending}
              onClick={() => {
                void (async () => {
                  const values = await form.validateFields();
                  await deleteMutation.mutateAsync(values);
                })();
              }}
            >
              {t("account:ME_DELETE_ACCOUNT_ACTION")}
            </Button>
          </>
        }
      >
        <div className="py-5">
          <div className="max-w-xl">
            <Alert
              type="warning"
              showIcon
              message={t("account:ME_DELETE_ACCOUNT_ALERT_TITLE")}
              description={t("account:ME_DELETE_ACCOUNT_ALERT_DESC")}
              className="mb-4"
            />

            <Form form={form} layout="vertical" requiredMark={false} autoComplete="off">
              <Form.Item
                name="email"
                label={t("account:ME_DELETE_ACCOUNT_CONFIRM_EMAIL")}
                rules={[
                  {
                    required: true,
                    message: t("account:ME_DELETE_ACCOUNT_CONFIRM_EMAIL_REQUIRED"),
                  },
                  { type: "email", message: t("account:ME_DELETE_ACCOUNT_CONFIRM_EMAIL_INVALID") },
                ]}
                className="mb-4"
              >
                <Input
                  placeholder={
                    normalizedEmail || t("account:ME_DELETE_ACCOUNT_CONFIRM_EMAIL_PLACEHOLDER")
                  }
                />
              </Form.Item>

              <Form.Item
                name="password"
                label={t("account:ME_DELETE_ACCOUNT_CONFIRM_PASSWORD")}
                rules={[{ required: true, message: t("auth:VALIDATION_PASSWORD_REQUIRED") }]}
                className="mb-0!"
              >
                <Input.Password
                  autoComplete="current-password"
                  placeholder={t("account:ME_DELETE_ACCOUNT_PASSWORD_PLACEHOLDER")}
                />
              </Form.Item>
            </Form>
          </div>
        </div>
      </SettingDialog>
    </>
  );
}
