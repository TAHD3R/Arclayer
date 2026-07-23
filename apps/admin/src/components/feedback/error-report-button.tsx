import { useTranslation } from "react-i18next";

import { HeaderFeedbackPopover } from "@/components/feedback/feedback-dialog";
import { ApiError } from "@/lib/http";
import { resolveRequestId } from "@/lib/notifications";
import { Button } from "@arclayer/ui/button";

export function ErrorReportButton(props: { error?: unknown }) {
  const { t } = useTranslation();
  const error = props.error;

  return (
    <HeaderFeedbackPopover
      source="content_guard"
      initialIntent="problem"
      lockIntent
      reportContext={{
        requestId: resolveRequestId(error),
        status: error instanceof ApiError ? error.status : undefined,
        errorCode: error instanceof ApiError ? error.error : undefined,
      }}
      trigger={
        <Button type="button" size="lg" variant="outline">
          {t("common:REPORT_PROBLEM")}
        </Button>
      }
    />
  );
}
