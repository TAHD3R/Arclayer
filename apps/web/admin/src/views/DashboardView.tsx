import { Card, Typography } from "antd";

export function DashboardView() {
  return (
    <Card>
      <Typography.Title level={2} style={{ marginTop: 0 }}>
        Dashboard
      </Typography.Title>
      <Typography.Paragraph>
        This is the starting point for the Celestial admin console.
      </Typography.Paragraph>
    </Card>
  );
}
