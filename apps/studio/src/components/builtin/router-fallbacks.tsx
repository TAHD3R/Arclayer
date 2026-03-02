import type { ErrorComponentProps, NotFoundRouteProps } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { Result } from "antd";
import { useTranslation } from "react-i18next";

export function RouterDefaultNotFound(_props: NotFoundRouteProps) {
  const { t } = useTranslation(["editor"]);
  return (
    <Result
      status="404"
      title={t("editor:EDITOR_ROUTER_NOT_FOUND_TITLE")}
      subTitle={t("editor:EDITOR_ROUTER_NOT_FOUND_DESC")}
      extra={<Link to="/">{t("editor:EDITOR_ROUTER_BACK_HOME")}</Link>}
    />
  );
}

export function RouterDefaultError(props: ErrorComponentProps) {
  const { t } = useTranslation(["editor"]);
  const msg = props.error instanceof Error ? props.error.message : String(props.error);
  return (
    <Result
      status="500"
      title={t("editor:EDITOR_ROUTER_ERROR_TITLE")}
      subTitle={msg || "Server Error"}
      extra={<Link to="/">{t("editor:EDITOR_ROUTER_BACK_HOME")}</Link>}
    />
  );
}
