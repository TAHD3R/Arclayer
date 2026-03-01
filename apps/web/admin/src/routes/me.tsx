import { Outlet, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { RouterDefaultNotFound } from "@/components/builtin/router-fallbacks";
import { AdminRouteContainer } from "@/components/layout/admin-route-container";
import { ChromeTabs, ChromeTabsList, ChromeTabsTrigger } from "@/components/ui/chrome-tabs";

type MeTabKey = "profile" | "preferences" | "security" | "notifications";

function resolveTabFromPath(pathname: string): MeTabKey {
  if (pathname.startsWith("/me/preferences")) return "preferences";
  if (pathname.startsWith("/me/security")) return "security";
  if (pathname.startsWith("/me/notifications")) return "notifications";
  return "profile";
}

export const Route = createFileRoute("/me")({
  staticData: { titleKey: "account:ME_TITLE" },
  component: MeLayout,
  notFoundComponent: RouterDefaultNotFound,
});

function MeLayout() {
  const { t } = useTranslation("account");
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const isInbox = pathname.startsWith("/me/inbox");
  if (isInbox) return <Outlet />;

  const tab = resolveTabFromPath(pathname);

  return (
    <AdminRouteContainer width="fixed" className="h-full">
      <header className="mb-[18px]">
        <div className="text-largetitle select-none">{t("ME_TITLE")}</div>
        <div className="mt-1 text-label-secondary select-none">{t("ME_DESC")}</div>

        <div className="mt-4">
          <ChromeTabs
            value={tab}
            onValueChange={(next) => {
              const key = String(next) as MeTabKey;
              void navigate({ to: `/me/${key}` });
            }}
          >
            <ChromeTabsList className="w-auto">
              <ChromeTabsTrigger value="profile">{t("ME_TAB_PROFILE")}</ChromeTabsTrigger>
              <ChromeTabsTrigger value="preferences">{t("ME_TAB_PREFERENCES")}</ChromeTabsTrigger>
              <ChromeTabsTrigger value="security">{t("ME_TAB_SECURITY")}</ChromeTabsTrigger>
              <ChromeTabsTrigger value="notifications">
                {t("ME_TAB_NOTIFICATIONS")}
              </ChromeTabsTrigger>
            </ChromeTabsList>
          </ChromeTabs>
        </div>
      </header>

      <div className="min-w-0 flex-1 min-h-0">
        <Outlet />
      </div>
    </AdminRouteContainer>
  );
}
