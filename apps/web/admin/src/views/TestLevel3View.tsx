import { Card, Typography } from "antd";

import { DefaultPage } from "@/components/app/DefaultPage";

export function TestLevel3View() {
  return (
    <DefaultPage
      title="Test / Level 3"
      description="Third-level route. Used to verify deep navigation and scroll behaviors."
      width="full"
    >
      <Card>
        <Typography.Paragraph style={{ marginBottom: 0 }}>
          This page uses full-width mode to demonstrate the `DefaultPage` width switch.
        </Typography.Paragraph>
      </Card>
    </DefaultPage>
  );
}
