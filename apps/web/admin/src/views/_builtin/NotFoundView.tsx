import { useTranslation } from "react-i18next";

import { BuiltinResultPage, type BuiltinResultVariant } from "@/views/_builtin/BuiltinResultPage";

export type NotFoundViewProps = {
  variant?: BuiltinResultVariant;
  details?: string | null;
};

export function NotFoundView({ variant = "admin", details }: NotFoundViewProps) {
  const { t } = useTranslation();

  return (
    <BuiltinResultPage
      variant={variant}
      status="404"
      title={t("common:PAGE_NOT_FOUND_TITLE")}
      subTitle={details || t("common:PAGE_NOT_FOUND_DESC")}
    />
  );
}
