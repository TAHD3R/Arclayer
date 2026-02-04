import { Space, Typography } from "antd";
import { lazy, Suspense, type PropsWithChildren, useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useRouterState } from "@tanstack/react-router";

import { getAppConfig } from "@/constants/app-config";
import { usePreferencesStore } from "@/stores/use-preference-store";
import { AdminLocaleToggle } from "@/components/common/admin-toggle-locales";
import { AdminThemeModeToggle } from "@/components/common/admin-toggle-theme";
import { RouteTransition } from "@/components/common/route-transition";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

const ColorBendsLazy = lazy(() => import("@/components/ui/color-bends"));
const AUTH_BEND_COLORS = ["#3b82f6"] as const;

export function AuthLayout({ children }: PropsWithChildren) {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const themeMode = usePreferencesStore((s) => s.themeMode);
  const isDark = themeMode === "dark";

  const reducedMotion = usePrefersReducedMotion();
  const [isLargeScreen, setIsLargeScreen] = useState(false);

  // Auth pages should always be a full-viewport "scene" without any document scrolling.
  // This also avoids 1px scrollbars caused by fractional rem sizing during resize.
  useEffect(() => {
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    return () => {
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
    };
  }, []);

  useEffect(() => {
    const brand = (getAppConfig().title || "Celestial").trim();
    const pageTitle =
      pathname === "/reset-password"
        ? t("auth:RESET_PASSWORD_PAGE_TITLE")
        : pathname === "/login"
          ? t("auth:LOGIN_PAGE_TITLE")
          : brand;
    document.title = `${pageTitle} | ${brand}`;
  }, [pathname, t]);

  useEffect(() => {
    const mq = window.matchMedia?.("(min-width: 1024px)");
    if (!mq) return;

    const update = () => setIsLargeScreen(mq.matches);
    update();

    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  return (
    <div className="fixed inset-0 w-full overflow-hidden grid grid-cols-1 lg:grid-cols-2 bg-(--color-background) text-(--color-foreground)">
      <div className="relative hidden lg:block min-h-0 h-full overflow-hidden bg-(--color-background)">
        {isLargeScreen && !reducedMotion ? (
          <Suspense fallback={<div className="absolute inset-0 bg-(--color-background)" />}>
            <ColorBendsLazy
              colors={AUTH_BEND_COLORS}
              rotation={45}
              speed={0.2}
              scale={1}
              frequency={1}
              warpStrength={1}
              mouseInfluence={1}
              parallax={1}
              noise={0.3}
              transparent
              autoRotate={0}
            />
          </Suspense>
        ) : null}

        <div className="absolute inset-0 flex items-end p-14">
          <div className="max-w-120 select-none">
            <Typography.Title
              level={1}
              style={{
                margin: 0,
                color: isDark ? "rgba(255,255,255,0.96)" : "rgba(20,20,20,0.96)",
                fontSize: 52,
                fontWeight: 700,
                lineHeight: 1.05,
                letterSpacing: -0.6,
                textShadow: isDark
                  ? "0 18px 60px rgba(0,0,0,0.35)"
                  : "0 18px 60px rgba(0,0,0,0.45)",
              }}
            >
              {t("auth:SLOGAN_TITLE")}
            </Typography.Title>
            <Typography.Paragraph
              style={{
                marginTop: 14,
                marginBottom: 0,
                color: isDark ? "rgba(255,255,255,0.78)" : "rgba(20,20,20,0.78)",
                fontSize: 20,
                lineHeight: 1.6,
                textShadow: isDark
                  ? "0 18px 60px rgba(0,0,0,0.35)"
                  : "0 18px 60px rgba(0,0,0,0.45)",
              }}
            >
              {t("auth:SLOGAN_SUBTITLE")}
            </Typography.Paragraph>
          </div>
        </div>
      </div>

      <div className="relative flex flex-col min-h-0 h-full overflow-hidden bg-(--color-background) text-(--color-foreground)">
        <div className="absolute top-0 right-0 p-4">
          <Space size={6}>
            <AdminLocaleToggle />
            <AdminThemeModeToggle />
          </Space>
        </div>

        <div className="flex-1 min-h-0 flex items-center justify-center overflow-hidden p-8">
          <div className="w-full max-w-90">
            <RouteTransition className="w-full" variant="fade">
              {children}
            </RouteTransition>
          </div>
        </div>

        <div className="p-4 text-center text-xs text-(--color-muted-foreground)">
          <Trans
            i18nKey="auth:FOOTER_COPYRIGHT"
            components={{
              brand: <span style={{ color: "var(--color-foreground)" }}>Celestial CMS</span>,
            }}
          />
        </div>
      </div>
    </div>
  );
}
