import { useTranslation } from "react-i18next";

import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { Button } from "@arclayer/ui/button";
import { Card, CardContent } from "@arclayer/ui/card";

export function ObservabilitySnapshotStateCard(props: {
  loading: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  const { t } = useTranslation("platform");
  const unavailable = !props.loading && !props.error;

  return (
    <Card className="flex h-full min-h-0 min-w-0 items-center overflow-hidden">
      <CardContent className="w-full p-5">
        <ContentGuard
          loading={props.loading}
          error={props.error}
          empty={unavailable}
          onRetry={props.onRetry}
          variant="compact"
          mediaVariant="none"
          wrapperSpacing="flush"
          errorTitle={t("DASHBOARD_SNAPSHOT_ERROR_TITLE")}
          errorDescription={t("DASHBOARD_SNAPSHOT_ERROR_DESCRIPTION")}
          emptyTitle={t("DASHBOARD_SNAPSHOT_ERROR_TITLE")}
          emptyDescription={t("DASHBOARD_SNAPSHOT_ERROR_DESCRIPTION")}
          emptyExtra={
            <Button size="sm" variant="outline" onClick={props.onRetry}>
              {t("common:RETRY")}
            </Button>
          }
        />
      </CardContent>
    </Card>
  );
}
