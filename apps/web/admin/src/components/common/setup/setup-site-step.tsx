import { Form, Input } from "antd";
import { AppWindow, Link } from "lucide-react";
import { useTranslation } from "react-i18next";

import { type SetupSiteDraft } from "@/stores/use-setup-wizard-store";

export function SetupSiteStep(props: {
  form: ReturnType<typeof Form.useForm<SetupSiteDraft>>[0];
  disabled?: boolean;
  onValuesChange: (changed: Partial<SetupSiteDraft>, values: Partial<SetupSiteDraft>) => void;
}) {
  const { t } = useTranslation();

  return (
    <Form<SetupSiteDraft>
      form={props.form}
      layout="vertical"
      requiredMark={false}
      autoComplete="off"
      disabled={props.disabled}
      onValuesChange={props.onValuesChange}
    >
      <Form.Item<SetupSiteDraft>
        name="workspaceName"
        label={t("setup:SETUP_FIELD_WORKSPACE_NAME_LABEL")}
        rules={[{ required: true, message: t("setup:SETUP_VALIDATION_WORKSPACE_NAME_REQUIRED") }]}
      >
        <Input
          autoComplete="off"
          aria-label={t("setup:SETUP_FIELD_WORKSPACE_NAME_LABEL")}
          placeholder={t("setup:SETUP_FIELD_WORKSPACE_NAME_PLACEHOLDER")}
          size="large"
        />
      </Form.Item>

      <Form.Item<SetupSiteDraft>
        name="siteName"
        label={t("setup:SETUP_FIELD_SITE_NAME_LABEL")}
        rules={[{ required: true, message: t("setup:SETUP_VALIDATION_SITE_NAME_REQUIRED") }]}
      >
        <Input
          autoComplete="off"
          aria-label={t("setup:SETUP_FIELD_SITE_NAME_LABEL")}
          placeholder={t("setup:SETUP_FIELD_SITE_NAME_PLACEHOLDER")}
          prefix={<AppWindow size={16} />}
          size="large"
        />
      </Form.Item>

      <Form.Item<SetupSiteDraft>
        name="siteUrl"
        label={t("setup:SETUP_FIELD_SITE_URL_LABEL")}
        rules={[
          { required: true, message: t("setup:SETUP_VALIDATION_SITE_URL_REQUIRED") },
          {
            validator: async (_rule, value: string | undefined) => {
              const raw = (value || "").trim();
              if (!raw) return;
              try {
                const url = new URL(raw);
                if (url.protocol !== "http:" && url.protocol !== "https:") {
                  throw new Error("protocol");
                }
              } catch {
                throw new Error(t("setup:SETUP_VALIDATION_SITE_URL_INVALID"));
              }
            },
          },
        ]}
      >
        <Input
          autoComplete="off"
          aria-label={t("setup:SETUP_FIELD_SITE_URL_LABEL")}
          placeholder={t("setup:SETUP_FIELD_SITE_URL_PLACEHOLDER")}
          prefix={<Link size={16} />}
          size="large"
        />
      </Form.Item>

      <Form.Item<SetupSiteDraft>
        name="siteDescription"
        label={t("setup:SETUP_FIELD_SITE_DESC_LABEL")}
      >
        <Input.TextArea
          autoSize={{ minRows: 3, maxRows: 6 }}
          aria-label={t("setup:SETUP_FIELD_SITE_DESC_LABEL")}
          placeholder={t("setup:SETUP_FIELD_SITE_DESC_PLACEHOLDER")}
          allowClear
          maxLength={160}
          showCount={{
            formatter: ({ count }) => `${count}/160`,
          }}
        />
      </Form.Item>
    </Form>
  );
}
