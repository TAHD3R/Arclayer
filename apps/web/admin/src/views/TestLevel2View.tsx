import { Card, Typography } from "antd";

import { DefaultPage } from "@/components/app/defaultPage";

export function TestLevel2View() {
  return (
    <DefaultPage
      title="Test / Level 2"
      description="Second-level route. Used to verify nested navigation groups and active trail behavior."
    >
      <Card>
        <Typography.Paragraph style={{ marginBottom: 0 }}>
          Next: open “Level 3” to confirm third-level route rendering.
        </Typography.Paragraph>
      </Card>
    </DefaultPage>
  );
}
