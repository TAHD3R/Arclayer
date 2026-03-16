import { useTranslation } from "react-i18next";

import { DefaultPage } from "@/components/common/default-page";
import { Card, CardContent } from "@arclayer/ui/card";

export function PlaceholderPage(props: { titleKey: string; descriptionKey?: string }) {
  const { t } = useTranslation();
  const description = props.descriptionKey
    ? t(props.descriptionKey)
    : t("common:PAGE_COMING_SOON_DESC");

  return (
    <DefaultPage title={t(props.titleKey)} description={description}>
      <Card>
        <CardContent className="pt-6">
          <p className="mb-0 text-body text-label-primary">{t("common:PAGE_COMING_SOON")}</p>
        </CardContent>
      </Card>
    </DefaultPage>
  );
}
