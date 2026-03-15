import { useTranslation } from "react-i18next";

import { DefaultPage } from "@/components/common/default-page";
import { Card, CardContent } from "@celestial/ui/card";

export function DashboardPage() {
  const { t } = useTranslation();

  return (
    <DefaultPage
      title={t("nav:NAV_DASHBOARD")}
      description="This is the starting point for the Celestial console."
    >
      <Card>
        <CardContent className="pt-6">
          <p className="mb-0 text-body text-label-primary">
            Build your widgets, tables, and metrics here.
          </p>
        </CardContent>
      </Card>
    </DefaultPage>
  );
}
