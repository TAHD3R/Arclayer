import { createFileRoute } from "@tanstack/react-router";
import { Card, Typography } from "antd";

function DashboardPage() {
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

export const Route = createFileRoute("/")({
  component: DashboardPage,
});
