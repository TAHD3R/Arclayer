import { Button, Card, Form, Input, Select, Space, Typography } from "antd";
import { useTranslation } from "react-i18next";

import { DefaultPage } from "@/components/common/default-page";

type GlobalStylesFormValues = {
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  radiusScale: string;
  spacingScale: string;
  containerWidth: string;
};

const INITIAL_VALUES: GlobalStylesFormValues = {
  primaryColor: "#2f6fff",
  secondaryColor: "#f5f7ff",
  fontFamily: "Inter",
  radiusScale: "md",
  spacingScale: "md",
  containerWidth: "lg",
};

export function WorkspaceGlobalStylesView() {
  const { t } = useTranslation(["appearance", "nav", "common"]);
  const [form] = Form.useForm<GlobalStylesFormValues>();

  return (
    <DefaultPage
      title={t("nav:NAV_APPEARANCE_STYLES")}
      description={t("appearance:GLOBAL_STYLES_DESC")}
    >
      <div className="flex flex-col gap-4">
        <Card title={t("appearance:GLOBAL_STYLES_CARD_TITLE")}>
          <Form<GlobalStylesFormValues>
            form={form}
            layout="vertical"
            initialValues={INITIAL_VALUES}
            onFinish={() => undefined}
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Form.Item
                label={t("appearance:GLOBAL_STYLES_FIELD_PRIMARY_COLOR")}
                name="primaryColor"
              >
                <Input />
              </Form.Item>

              <Form.Item
                label={t("appearance:GLOBAL_STYLES_FIELD_SECONDARY_COLOR")}
                name="secondaryColor"
              >
                <Input />
              </Form.Item>

              <Form.Item label={t("appearance:GLOBAL_STYLES_FIELD_FONT_FAMILY")} name="fontFamily">
                <Select
                  options={[
                    { value: "Inter", label: "Inter" },
                    { value: "DM Sans", label: "DM Sans" },
                    { value: "Noto Sans", label: "Noto Sans" },
                  ]}
                />
              </Form.Item>

              <Form.Item
                label={t("appearance:GLOBAL_STYLES_FIELD_CONTAINER_WIDTH")}
                name="containerWidth"
              >
                <Select
                  options={[
                    { value: "sm", label: "SM" },
                    { value: "md", label: "MD" },
                    { value: "lg", label: "LG" },
                    { value: "xl", label: "XL" },
                  ]}
                />
              </Form.Item>

              <Form.Item
                label={t("appearance:GLOBAL_STYLES_FIELD_RADIUS_SCALE")}
                name="radiusScale"
              >
                <Select
                  options={[
                    { value: "sm", label: "SM" },
                    { value: "md", label: "MD" },
                    { value: "lg", label: "LG" },
                  ]}
                />
              </Form.Item>

              <Form.Item
                label={t("appearance:GLOBAL_STYLES_FIELD_SPACING_SCALE")}
                name="spacingScale"
              >
                <Select
                  options={[
                    { value: "sm", label: "SM" },
                    { value: "md", label: "MD" },
                    { value: "lg", label: "LG" },
                  ]}
                />
              </Form.Item>
            </div>

            <Space>
              <Button htmlType="button" onClick={() => form.resetFields()}>
                {t("appearance:GLOBAL_STYLES_ACTION_RESET")}
              </Button>
              <Button type="primary" htmlType="submit">
                {t("appearance:GLOBAL_STYLES_ACTION_APPLY")}
              </Button>
            </Space>
          </Form>
        </Card>

        <Card title={t("appearance:GLOBAL_STYLES_PRECEDENCE_TITLE")}>
          <Typography.Paragraph className="!mb-0 text-sm text-muted-foreground">
            {t("appearance:GLOBAL_STYLES_PRECEDENCE_DESC")}
          </Typography.Paragraph>
        </Card>
      </div>
    </DefaultPage>
  );
}
