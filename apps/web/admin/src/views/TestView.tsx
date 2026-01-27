import { Button, Card, Space, Tag, Typography } from "antd";

import { DefaultPage } from "@/components/app/DefaultPage";

export function TestView() {
  return (
    <DefaultPage
      title="Test / Overview"
      description="A sandbox route used to validate 2-level and 3-level navigation rendering."
      action={
        <Space size={10}>
          <Tag color="blue">Demo</Tag>
          <Button type="primary">Primary Action</Button>
        </Space>
      }
      extra={
        <Card size="small">
          <Typography.Text type="secondary">
            Extra slot: filters / tabs / quick actions
          </Typography.Text>
        </Card>
      }
    >
      <Card>
        <Typography.Paragraph style={{ marginBottom: 0 }}>
          Use this page to verify: content padding, fixed width container, and navigation active
          state.
        </Typography.Paragraph>
      </Card>
    </DefaultPage>
  );
}
