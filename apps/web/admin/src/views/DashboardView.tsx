import { Card, Typography } from "antd";

import { DefaultPage } from "@/components/app/DefaultPage";

export function DashboardView() {
  return (
    <DefaultPage
      title="Dashboard"
      description="This is the starting point for the Celestial admin console."
    >
      <Card>
        <Typography.Paragraph style={{ marginBottom: 0 }}>
          Build your widgets, tables, and metrics here.
        </Typography.Paragraph>
      </Card>
    </DefaultPage>
  );
}
