import { Link, type ErrorComponentProps } from "@tanstack/react-router";
import { AlertTriangle, SearchX } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { PlatformSetupApiError } from "@/setup/setup-api";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export function RouterError({ error, reset }: ErrorComponentProps) {
  const { t } = useTranslation(["common", "errors"]);
  const setupStateFailed = error instanceof PlatformSetupApiError;
  useEffect(() => {
    console.error("[platform] Route rendering failed", error);
  }, [error]);
  return (
    <Empty className="min-h-[60vh]">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <AlertTriangle aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>
          {t(
            setupStateFailed
              ? "errors:PLATFORM_SETUP_STATE_UNAVAILABLE"
              : "errors:UNEXPECTED_TITLE",
          )}
        </EmptyTitle>
        <EmptyDescription>
          {t(
            setupStateFailed
              ? "errors:PLATFORM_SETUP_STATE_UNAVAILABLE_RECOVERY"
              : "errors:UNEXPECTED_DESCRIPTION",
          )}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={reset}>{t("common:TRY_AGAIN")}</Button>
      </EmptyContent>
    </Empty>
  );
}

export function RouterNotFound() {
  const { t } = useTranslation(["common", "errors"]);
  return (
    <Empty className="min-h-[60vh]">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SearchX aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{t("errors:PAGE_NOT_FOUND_TITLE")}</EmptyTitle>
        <EmptyDescription>{t("errors:PAGE_NOT_FOUND_DESCRIPTION")}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild>
          <Link to="/">{t("common:RETURN_TO_OVERVIEW")}</Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
}
