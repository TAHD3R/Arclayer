import { useTranslation } from "react-i18next";

import { AdminTopbar } from "@/components/layout/admin-topbar";

export function UserCenterTopbar(props: {
  backLabel?: string;
  onBack?: () => void;
  className?: string;
}) {
  const { t } = useTranslation(["common"]);

  return (
    <AdminTopbar
      leadingMode="back"
      backLabel={props.backLabel ?? t("common:BACK")}
      onBack={props.onBack ?? (() => undefined)}
      className={props.className}
    />
  );
}
