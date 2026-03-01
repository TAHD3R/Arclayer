import { useTranslation } from "react-i18next";

import {
  BuiltinResultPage,
  type BuiltinResultVariant,
} from "@/components/builtin/builtin-result-page";

export type ServerErrorViewProps = {
  variant?: BuiltinResultVariant;
  details?: string | null;
};

export function ServerErrorView({ variant = "admin" }: ServerErrorViewProps) {
  const { t } = useTranslation();

  return (
    <BuiltinResultPage
      variant={variant}
      status="500"
      title={t("common:PAGE_SERVER_ERROR_TITLE")}
      subTitle={t("common:PAGE_SERVER_ERROR_DESC")}
    />
  );
}
