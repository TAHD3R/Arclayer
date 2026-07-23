import { useTranslation } from "react-i18next";

import {
  BuiltinResultPage,
  type BuiltinResultVariant,
} from "@/components/builtin/builtin-result-page";
import { ErrorReportButton } from "@/components/feedback/error-report-button";
import { Button } from "@arclayer/ui/button";

export type ServerErrorViewProps = {
  variant?: BuiltinResultVariant;
  error?: unknown;
};

export function ServerErrorView({ variant = "admin", error }: ServerErrorViewProps) {
  const { t } = useTranslation();

  return (
    <BuiltinResultPage
      variant={variant}
      status="500"
      title={t("common:PAGE_SERVER_ERROR_TITLE")}
      subTitle={t("common:PAGE_SERVER_ERROR_DESC")}
      extra={
        <>
          <Button type="button" size="lg" onClick={() => window.location.reload()}>
            {t("common:REFRESH")}
          </Button>
          <ErrorReportButton error={error} />
        </>
      }
    />
  );
}
