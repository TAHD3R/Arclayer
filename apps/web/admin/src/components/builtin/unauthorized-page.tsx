import { useTranslation } from "react-i18next";

import {
  BuiltinResultPage,
  type BuiltinResultVariant,
} from "@/components/builtin/builtin-result-page";

export type UnauthorizedViewProps = {
  variant?: BuiltinResultVariant;
  details?: string | null;
};

export function UnauthorizedView({ variant = "fullscreen" }: UnauthorizedViewProps) {
  const { t } = useTranslation();

  return (
    <BuiltinResultPage
      variant={variant}
      status="401"
      title={t("common:PAGE_UNAUTHORIZED_TITLE")}
      subTitle={t("common:PAGE_UNAUTHORIZED_DESC")}
    />
  );
}
