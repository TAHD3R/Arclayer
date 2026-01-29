import { Card, Space, Typography } from "antd";
import { lazy, Suspense, type PropsWithChildren, useEffect } from "react";
import { Trans, useTranslation } from "react-i18next";

import { getAppConfig } from "@/constants/app-config";
import { usePreferencesStore } from "@/stores/usePreferenceStore";
import { AdminLocaleToggle } from "@/components/app/adminToggleLocales";
import { AdminThemeModeToggle } from "@/components/app/adminToggleTheme";
import { AdminLogo } from "@/components/app/adminLogo";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

const ColorBendsLazy = lazy(() => import("@/components/ui/color-bends"));
const SETUP_BEND_COLORS = ["#3b82f6"] as const;

export function SetupLayout({ children }: PropsWithChildren) {
  const { t } = useTranslation();
  const themeMode = usePreferencesStore((s) => s.themeMode);
  const isDark = themeMode === "dark";
  const reducedMotion = usePrefersReducedMotion();

  // Setup pages should behave like auth pages: full-viewport scene, no document scrolling.
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
    document.title = `${t("setup:SETUP_TITLE")} | ${brand}`;
  }, [t]);

  return (
    <div className="fixed inset-0 w-full overflow-hidden bg-(--color-background) text-(--color-foreground)">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {!reducedMotion ? (
          <Suspense fallback={<div className="absolute inset-0 bg-(--color-background)" />}>
            <ColorBendsLazy
              colors={SETUP_BEND_COLORS}
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

        {/* Subtle overlay to keep foreground readable over the animated background. */}
        <div className="absolute inset-0 bg-(--color-background) opacity-80" />
      </div>

      {/* Top-right toggles */}
      {/* Keep this above the center content layer; otherwise the full-screen container can "eat" clicks. */}
      <div className="absolute top-0 right-0 p-4 z-30">
        <Space size={6}>
          <AdminLocaleToggle />
          <AdminThemeModeToggle />
        </Space>
      </div>

      {/* Left-bottom intro text */}
      <div className="absolute left-0 bottom-0 p-10 z-20 hidden lg:block">
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
              textShadow: isDark ? "0 18px 60px rgba(0,0,0,0.35)" : "0 18px 60px rgba(0,0,0,0.45)",
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
              textShadow: isDark ? "0 18px 60px rgba(0,0,0,0.35)" : "0 18px 60px rgba(0,0,0,0.45)",
            }}
          >
            {t("auth:SLOGAN_SUBTITLE")}
          </Typography.Paragraph>
        </div>
      </div>

      {/* Center content */}
      <div className="relative z-10 h-full w-full flex flex-col min-h-0">
        <div className="pt-10 pb-4 flex justify-center">
          <AdminLogo to="/setup" ariaLabel="Celestial Setup" />
        </div>

        <div className="flex-1 min-h-0 flex items-start justify-center p-6 pt-2 overflow-hidden">
          <div className="w-full max-w-140 max-h-full overflow-auto">
            <Card>{children}</Card>
          </div>
        </div>

        {/* Bottom-center copyright */}
        <div className="pb-6 text-center text-xs text-(--color-muted-foreground) select-none">
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
