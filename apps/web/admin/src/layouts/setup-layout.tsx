import { Space } from "antd";
import { lazy, Suspense, type PropsWithChildren, useEffect } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useRouterState } from "@tanstack/react-router";

import { getAppConfig } from "@/constants/app-config";
import { AdminLocaleToggle } from "@/components/common/admin-toggle-locales";
import { AdminThemeModeToggle } from "@/components/common/admin-toggle-theme";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

const ColorBendsLazy = lazy(() => import("@/components/ui/color-bends"));
const SETUP_BEND_COLORS = ["#3b82f6"] as const;

export function SetupLayout({ children }: PropsWithChildren) {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isOnboardingPath = pathname === "/onboarding" || pathname.startsWith("/onboarding/");
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
    const pageTitle = isOnboardingPath ? t("onboarding:ONBOARDING_TITLE") : t("setup:SETUP_TITLE");
    document.title = `${pageTitle} | ${brand}`;
  }, [isOnboardingPath, t]);

  return (
    <div className="fixed inset-0 w-full overflow-hidden bg-background text-label-primary">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {!reducedMotion ? (
          <Suspense fallback={<div className="absolute inset-0 bg-background" />}>
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
        <div className="absolute inset-0 bg-background opacity-80" />
      </div>

      {/* Top-right toggles */}
      <div className="absolute top-0 right-0 p-4 z-30">
        <Space size={6}>
          <AdminLocaleToggle />
          <AdminThemeModeToggle />
        </Space>
      </div>

      <div className="relative z-10 h-full w-full flex flex-col min-h-0">
        <div className="flex-1 min-h-0 flex items-center justify-center p-4 sm:p-6 overflow-hidden">
          <div className="w-full max-w-6xl max-h-full overflow-auto">{children}</div>
        </div>

        <div className="pb-6 text-center text-caption text-label-secondary select-none">
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
