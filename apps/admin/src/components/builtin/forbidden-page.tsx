import { useTranslation } from "react-i18next";

import {
  BuiltinResultPage,
  type BuiltinResultVariant,
} from "@/components/builtin/builtin-result-page";

export type ForbiddenViewProps = {
  variant?: BuiltinResultVariant;
  details?: string | null;
};

export function ForbiddenView({ variant = "admin" }: ForbiddenViewProps) {
  const { t } = useTranslation();

  return (
    <BuiltinResultPage
      variant={variant}
      status="403"
      title={t("common:PAGE_FORBIDDEN_TITLE")}
      subTitle={t("common:PAGE_FORBIDDEN_DESC")}
    />
  );
}
