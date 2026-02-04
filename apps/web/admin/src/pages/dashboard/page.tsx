import { Card, Typography } from "antd";
import { useTranslation } from "react-i18next";

import { DefaultPage } from "@/components/common/default-page";

export function DashboardView() {
  const { t } = useTranslation();

  return (
    <DefaultPage
      title={t("nav:NAV_DASHBOARD")}
      description="This is the starting point for the Celestial console."
    >
      <Card>
        <Typography.Paragraph style={{ marginBottom: 0 }}>
          Build your widgets, tables, and metrics here.
        </Typography.Paragraph>
      </Card>
    </DefaultPage>
  );
}
