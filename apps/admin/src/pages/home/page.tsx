import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { DefaultPage } from "@/layouts/page-shell/default-page";
import { Button } from "@arclayer/ui/button";
import { Card, CardContent } from "@arclayer/ui/card";

export function HomePage() {
  const navigate = useNavigate();
  const { t } = useTranslation(["account", "common", "nav"]);
  const openWorkspaces = () => void navigate({ to: "/workspaces", search: { create: undefined } });

  return (
    <DefaultPage
      title={t("nav:NAV_HOME")}
      description={t("common:GLOBAL_HOME_DESC")}
      showFavoriteToggle={false}
      action={
        <Button variant="default" onClick={openWorkspaces}>
          {t("account:ACCOUNT_NAV_WORKSPACES")}
        </Button>
      }
    >
      <Card className="max-w-3xl">
        <CardContent className="flex flex-col gap-4 pt-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <p className="text-body font-medium text-foreground">{t("nav:NAV_HOME")}</p>
            <p className="text-body text-label-secondary">
              {t("account:ACCOUNT_PAGE_WORKSPACES_DESC")}
            </p>
          </div>

          <Button variant="outline" onClick={openWorkspaces}>
            {t("common:GLOBAL_HOME_OPEN_WORKSPACES")}
          </Button>
        </CardContent>
      </Card>
    </DefaultPage>
  );
}
