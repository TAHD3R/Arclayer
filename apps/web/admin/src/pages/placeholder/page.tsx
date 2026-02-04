import { Card, Typography } from "antd";
import { useTranslation } from "react-i18next";

import { DefaultPage } from "@/components/common/default-page";

export function PlaceholderView(props: { titleKey: string }) {
  const { t } = useTranslation();

  return (
    <DefaultPage title={t(props.titleKey)} description={t("common:PAGE_COMING_SOON_DESC")}>
      <Card>
        <Typography.Paragraph style={{ marginBottom: 0 }}>
          {t("common:PAGE_COMING_SOON")}
        </Typography.Paragraph>
      </Card>
    </DefaultPage>
  );
}
