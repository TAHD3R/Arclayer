import { useEffect } from "react";
import { Button as AntButton, Form, Input, Select } from "antd";

import type { OrgRole } from "@/types/api";
import { SettingDialog } from "@/components/common/setting-dialog";
import { getPopupContainerWithinOverlay } from "@/lib/antd/popup-container";

type Translate = (key: string, options?: Record<string, unknown>) => string;

export type InviteOrganizationMemberValues = {
  email: string;
  role: OrgRole;
};

type InviteOrganizationMemberDialogProps = {
  open: boolean;
  loading: boolean;
  defaultRole: OrgRole;
  roleOptions: Array<{ value: OrgRole; label: string }>;
  t: Translate;
  onClose: () => void;
  onSubmit: (values: InviteOrganizationMemberValues) => Promise<void>;
};

export function InviteOrganizationMemberDialog(props: InviteOrganizationMemberDialogProps) {
  const { defaultRole, loading, onClose, onSubmit, open, roleOptions, t } = props;

  const [form] = Form.useForm<InviteOrganizationMemberValues>();

  useEffect(() => {
    if (!open) {
      form.resetFields();
      return;
    }

    form.setFieldsValue({ role: defaultRole });
  }, [defaultRole, form, open]);

  return (
    <SettingDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !loading) {
          onClose();
        }
      }}
      title={t("common:ORG_MEMBERS_INVITE")}
      description={t("common:ORG_MEMBERS_DESC")}
      contentClassName="sm:max-w-xl"
      footer={
        <>
          <AntButton type="text" onClick={onClose} disabled={loading}>
            {t("common:CANCEL")}
          </AntButton>
          <AntButton
            type="primary"
            loading={loading}
            onClick={async () => {
              const values = await form.validateFields();
              await onSubmit(values);
            }}
          >
            {t("common:CONFIRM")}
          </AntButton>
        </>
      }
    >
      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item
          name="email"
          label={
            <div className="grid gap-1.5">
              <span className="font-semibold text-foreground">
                {t("common:ORG_MEMBERS_INVITE_EMAIL")}
              </span>
              <span className="text-label-secondary">
                {t("common:ORG_MEMBERS_INVITE_EMAIL_HELP")}
              </span>
            </div>
          }
          rules={[
            { required: true, message: t("common:ORG_MEMBERS_INVITE_EMAIL_REQUIRED") },
            { type: "email", message: t("team:TEAM_INVITE_VALIDATION_EMAIL_INVALID") },
          ]}
        >
          <Input placeholder={t("common:ORG_MEMBERS_INVITE_EMAIL_PLACEHOLDER")} />
        </Form.Item>

        <Form.Item
          name="role"
          label={
            <div className="grid gap-1.5">
              <span className="font-semibold text-foreground">
                {t("common:ORG_MEMBERS_INVITE_ROLE")}
              </span>
              <span className="text-label-secondary">
                {t("common:ORG_MEMBERS_INVITE_ROLE_HELP")}
              </span>
            </div>
          }
          rules={[{ required: true, message: t("common:ORG_MEMBERS_INVITE_ROLE_REQUIRED") }]}
        >
          <Select
            options={roleOptions}
            getPopupContainer={(node) => getPopupContainerWithinOverlay(node)}
          />
        </Form.Item>
      </Form>
    </SettingDialog>
  );
}
