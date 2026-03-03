import { useMutation } from "@tanstack/react-query";
import { Button, Form, Input, message } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import * as authApi from "@/api/auth";
import { SettingDialog } from "@celestial/ui/setting-dialog";
import { SettingVerticalItem } from "@celestial/ui/setting-vertical-item";

type ChangePasswordFormValues = {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
};

export function MeSecurityChangePasswordSection() {
  const { t } = useTranslation(["account", "auth", "settings", "common"]);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<ChangePasswordFormValues>();

  const changePasswordMutation = useMutation({
    mutationFn: async (values: { oldPassword: string; newPassword: string }) => {
      return authApi.changePassword({
        old_password: values.oldPassword,
        new_password: values.newPassword,
      });
    },
    onSuccess: async () => {
      message.success(t("account:ME_SECURITY_PASSWORD_CHANGED"));
      form.resetFields();
      setOpen(false);
    },
    onError: () => {
      message.error(t("account:ME_SECURITY_PASSWORD_CHANGE_FAILED"));
    },
  });

  return (
    <>
      <SettingVerticalItem
        title={t("account:ME_SECURITY_CHANGE_PASSWORD_TITLE")}
        control={
          <Button type="primary" onClick={() => setOpen(true)}>
            {t("account:ME_SECURITY_CHANGE_PASSWORD_ACTION")}
          </Button>
        }
      />

      <SettingDialog
        open={open}
        onOpenChange={(next) => {
          if (!next && changePasswordMutation.isPending) return;
          if (!next) form.resetFields();
          setOpen(next);
        }}
        title={t("account:ME_SECURITY_CHANGE_PASSWORD_DIALOG_TITLE")}
        description={t("account:ME_SECURITY_CHANGE_PASSWORD_DIALOG_DESC")}
        footer={
          <>
            <Button
              type="text"
              disabled={changePasswordMutation.isPending}
              onClick={() => setOpen(false)}
            >
              {t("common:CANCEL")}
            </Button>
            <Button
              type="primary"
              loading={changePasswordMutation.isPending}
              onClick={() =>
                void (async () => {
                  const values = await form.validateFields();
                  await changePasswordMutation.mutateAsync({
                    oldPassword: values.oldPassword,
                    newPassword: values.newPassword,
                  });
                })()
              }
            >
              {t("settings:SETTINGS_SAVE")}
            </Button>
          </>
        }
      >
        <div className="py-5">
          <div className="max-w-xl">
            <Form form={form} layout="vertical" requiredMark={false} autoComplete="off">
              <Form.Item<ChangePasswordFormValues>
                name="oldPassword"
                label={t("account:ME_SECURITY_OLD_PASSWORD")}
                rules={[{ required: true, message: t("auth:VALIDATION_PASSWORD_REQUIRED") }]}
                className="mb-4"
              >
                <Input.Password autoComplete="current-password" />
              </Form.Item>

              <Form.Item<ChangePasswordFormValues>
                name="newPassword"
                label={t("account:ME_SECURITY_NEW_PASSWORD")}
                rules={[{ required: true, message: t("auth:VALIDATION_PASSWORD_REQUIRED") }]}
                className="mb-4"
              >
                <Input.Password autoComplete="new-password" />
              </Form.Item>

              <Form.Item<ChangePasswordFormValues>
                name="confirmPassword"
                label={t("account:ME_SECURITY_CONFIRM_PASSWORD")}
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
                className="mb-0!"
              >
                <Input.Password autoComplete="new-password" />
              </Form.Item>
            </Form>
          </div>
        </div>
      </SettingDialog>
    </>
  );
}
