import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Button, Form, Input } from "antd";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";

import * as authApi from "@/api/auth";
import { SettingDialog } from "@celestial/ui/setting-dialog";
import { notifyError, notifySuccessText } from "@/lib/notifications";

export type MeProfileChangeEmailDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nextEmail: string;
};

type ChangeEmailFormValues = {
  newEmail: string;
  code: string;
  password: string;
};

export function MeProfileChangeEmailDialog(props: MeProfileChangeEmailDialogProps) {
  const { t } = useTranslation(["account", "auth", "settings"]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<ChangeEmailFormValues>();

  const normalizedEmail = useMemo(() => String(props.nextEmail || "").trim(), [props.nextEmail]);

  useEffect(() => {
    if (!props.open) return;
    form.setFieldsValue({
      newEmail: normalizedEmail,
      code: "",
      password: "",
    });
  }, [form, normalizedEmail, props.open]);

  const requestCodeMutation = useMutation({
    mutationFn: async (payload: { newEmail: string }) => {
      return authApi.requestMyEmailChange({ new_email: payload.newEmail });
    },
    onSuccess: (out) => {
      notifySuccessText(
        t("account:ME_PROFILE_EMAIL_CODE_SENT", { seconds: String(out.expires_in ?? 0) }),
      );
    },
    onError: (err) => notifyError(err),
  });

  const confirmMutation = useMutation({
    mutationFn: async (payload: { newEmail: string; code: string; password: string }) => {
      return authApi.confirmMyEmailChange({
        new_email: payload.newEmail,
        code: payload.code,
        password: payload.password,
      });
    },
    onSuccess: async () => {
      notifySuccessText(t("settings:SETTINGS_SAVED"));
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      props.onOpenChange(false);
      form.resetFields();
    },
    onError: (err) => notifyError(err),
  });

  const isBusy = requestCodeMutation.isPending || confirmMutation.isPending;

  const closeIfIdle = (open: boolean) => {
    if (!open && isBusy) return;
    if (!open) form.resetFields();
    props.onOpenChange(open);
  };

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={closeIfIdle}
      title={t("account:ME_PROFILE_EMAIL_DIALOG_TITLE")}
      description={t("account:ME_PROFILE_EMAIL_DIALOG_DESC")}
      footer={
        <>
          <Button
            type="text"
            disabled={isBusy}
            onClick={() => closeIfIdle(false)}
            autoInsertSpace={false}
          >
            {t("auth:MODAL_CANCEL")}
          </Button>
          <Button
            type="primary"
            loading={confirmMutation.isPending}
            disabled={isBusy}
            onClick={() => {
              void (async () => {
                const values = await form.validateFields();
                await confirmMutation.mutateAsync({
                  newEmail: values.newEmail,
                  code: values.code,
                  password: values.password,
                });
              })();
            }}
            autoInsertSpace={false}
          >
            {t("settings:SETTINGS_SAVE")}
          </Button>
        </>
      }
    >
      <Form form={form} layout="vertical" requiredMark={false} autoComplete="off">
        <Form.Item
          name="newEmail"
          label={t("account:ME_PROFILE_EMAIL_NEW_EMAIL")}
          rules={[
            { required: true, message: t("account:ME_PROFILE_EMAIL_NEW_EMAIL_REQUIRED") },
            { type: "email", message: t("account:ME_PROFILE_EMAIL_NEW_EMAIL_INVALID") },
          ]}
          className="mb-4"
        >
          <Input placeholder={t("account:ME_PROFILE_EMAIL_NEW_EMAIL_PLACEHOLDER")} />
        </Form.Item>

        <Form.Item
          name="code"
          label={t("account:ME_PROFILE_EMAIL_CODE")}
          rules={[{ required: true, message: t("account:ME_PROFILE_EMAIL_CODE_REQUIRED") }]}
          className="mb-4"
        >
          <Input
            placeholder={t("account:ME_PROFILE_EMAIL_CODE_PLACEHOLDER")}
            addonAfter={
              <Button
                type="link"
                className="px-0!"
                disabled={isBusy}
                onClick={() => {
                  void (async () => {
                    const values = await form.validateFields(["newEmail"]);
                    await requestCodeMutation.mutateAsync({ newEmail: values.newEmail });
                  })();
                }}
                autoInsertSpace={false}
              >
                {requestCodeMutation.isPending
                  ? t("account:ME_PROFILE_EMAIL_SENDING_CODE")
                  : t("account:ME_PROFILE_EMAIL_SEND_CODE")}
              </Button>
            }
          />
        </Form.Item>

        <Form.Item
          name="password"
          label={t("account:ME_PROFILE_EMAIL_PASSWORD")}
          rules={[{ required: true, message: t("auth:VALIDATION_PASSWORD_REQUIRED") }]}
          className="mb-2"
        >
          <Input.Password placeholder={t("account:ME_PROFILE_EMAIL_PASSWORD_PLACEHOLDER")} />
        </Form.Item>

        <Button
          type="link"
          className="px-0!"
          disabled={isBusy}
          onClick={() => {
            closeIfIdle(false);
            void navigate({ to: "/reset-password" });
          }}
          autoInsertSpace={false}
        >
          {t("account:ME_PROFILE_EMAIL_FORGOT_PASSWORD")}
        </Button>
      </Form>
    </SettingDialog>
  );
}
