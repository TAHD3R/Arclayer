import { Outlet, createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { RouterDefaultNotFound } from "@/components/builtin/router-fallbacks";
import { AdminRouteContainer } from "@/components/layout/admin-route-container";

export const Route = createFileRoute("/sys")({
  staticData: { titleKey: "sys:SYS_TITLE" },
  component: SysLayout,
  notFoundComponent: RouterDefaultNotFound,
});

function SysLayout() {
  const { t } = useTranslation("sys");

  return (
    <AdminRouteContainer className="min-h-full">
      <header className="mb-[18px]">
        <div className="text-largetitle select-none">{t("SYS_TITLE")}</div>
        <div className="mt-1 text-label-secondary select-none">{t("SYS_DESC")}</div>
      </header>

      <div className="min-w-0 flex-1 min-h-0">
        <Outlet />
      </div>
    </AdminRouteContainer>
  );
}
