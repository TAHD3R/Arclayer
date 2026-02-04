import { createFileRoute } from "@tanstack/react-router";
import { Card, Typography } from "antd";
import { useTranslation } from "react-i18next";

import { DefaultPage } from "@/components/common/default-page";

export const Route = createFileRoute("/plugins/$pluginSlug/")({
  component: PluginSlugPage,
});

function PluginSlugPage() {
  const { t } = useTranslation(["nav", "common"]);
  const { pluginSlug } = Route.useParams();

  return (
    <DefaultPage
      title={`${t("nav:NAV_PLUGINS")} / ${pluginSlug}`}
      description={t("common:PAGE_COMING_SOON_DESC")}
    >
      <Card>
        <Typography.Paragraph style={{ marginBottom: 0 }}>
          {t("common:PAGE_COMING_SOON")}
        </Typography.Paragraph>
      </Card>
    </DefaultPage>
  );
}
