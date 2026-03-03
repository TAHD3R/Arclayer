import { Button, Form, Input } from "antd";
import { Building2 } from "lucide-react";
import { useTranslation } from "react-i18next";

type SetupOrganizationDraft = {
  organizationName: string;
};

export function SetupOrganizationStep(props: {
  form: ReturnType<typeof Form.useForm<SetupOrganizationDraft>>[0];
  disabled?: boolean;
  onValuesChange: (
    changed: Partial<SetupOrganizationDraft>,
    values: Partial<SetupOrganizationDraft>,
  ) => void;
}) {
  const { t } = useTranslation();

  return (
    <Form<SetupOrganizationDraft>
      form={props.form}
      layout="vertical"
      requiredMark={false}
      autoComplete="off"
      disabled={props.disabled}
      onValuesChange={props.onValuesChange}
    >
      <Form.Item<SetupOrganizationDraft>
        name="organizationName"
        label={t("setup:SETUP_FIELD_ORGANIZATION_NAME_LABEL")}
        rules={[
          { required: true, message: t("setup:SETUP_VALIDATION_ORGANIZATION_NAME_REQUIRED") },
        ]}
      >
        <Input
          autoComplete="off"
          aria-label={t("setup:SETUP_FIELD_ORGANIZATION_NAME_LABEL")}
          placeholder={t("setup:SETUP_FIELD_ORGANIZATION_NAME_PLACEHOLDER")}
          prefix={<Building2 size={16} />}
          size="large"
        />
      </Form.Item>

      {/* Prevent Enter key from moving steps unexpectedly. */}
      <Button htmlType="submit" style={{ display: "none" }} autoInsertSpace={false} />
    </Form>
  );
}
