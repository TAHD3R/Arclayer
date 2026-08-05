import type { ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@arclayer/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@arclayer/ui/alert";

type AccessNoticeAlertProps = {
  className?: string;
  description: ReactNode;
  "data-testid"?: string;
};

export function AccessNoticeAlert(props: AccessNoticeAlertProps) {
  const { t } = useTranslation("common");

  return (
    <Alert
      className={cn(
        "border-amber-500/30 bg-amber-500/8 text-amber-950 dark:text-amber-100",
        props.className,
      )}
      data-testid={props["data-testid"]}
    >
      <TriangleAlert className="text-amber-600 dark:text-amber-300" />
      <AlertTitle className="text-headline font-semibold">{t("PAGE_FORBIDDEN_TITLE")}</AlertTitle>
      <AlertDescription className="text-callout! text-amber-800/90 dark:text-amber-200/85">
        <p>{props.description}</p>
      </AlertDescription>
    </Alert>
  );
}
