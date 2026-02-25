import { lazy, Suspense, type PropsWithChildren, useEffect } from "react";
import { Trans, useTranslation } from "react-i18next";

import { getAppConfig } from "@/constants/app-config";
import { AdminFullLogo } from "@/components/common/admin-logo";
import { AdminLocaleToggle } from "@/components/common/admin-toggle-locales";
import { AdminThemeModeToggle } from "@/components/common/admin-toggle-theme";
import { LegalFooter } from "@/components/common/legal-footer";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

const ColorBendsLazy = lazy(() => import("@/components/ui/color-bends"));
const INVITE_BEND_COLORS = ["#3b82f6"] as const;

export function InviteLayout({ children }: PropsWithChildren) {
  const { t } = useTranslation();
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const brand = (getAppConfig().title || "Celestial").trim();
    document.title = `${t("invite:INVITE_PAGE_TITLE", { defaultValue: "Accept Invite" })} | ${brand}`;
  }, [t]);

  // Lock viewport scrolling — same pattern as AuthLayout.
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

  return (
    <div className="fixed inset-0 overflow-hidden bg-background text-label-primary">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {!reducedMotion ? (
          <Suspense fallback={<div className="absolute inset-0 bg-background" />}>
            <ColorBendsLazy
              colors={INVITE_BEND_COLORS}
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
        <div className="absolute inset-0 bg-background opacity-80" />
      </div>

      <div className="relative z-10 flex flex-col h-full">
        <div className="flex items-center justify-between p-4">
          <AdminFullLogo to="/login" ariaLabel="Celestial CMS" width={120} />
          <div className="flex items-center gap-2">
            <AdminLocaleToggle />
            <AdminThemeModeToggle />
          </div>
        </div>

        <div className="flex-1 min-h-0 flex items-center justify-center overflow-y-auto p-8">
          <div className="w-full max-w-[480px]">{children}</div>
        </div>

        <div className="p-4 text-center space-y-1">
          <LegalFooter i18nKey="auth:LEGAL_CONTINUE" />
          <div className="text-caption text-label-secondary">
            <Trans
              i18nKey="auth:FOOTER_COPYRIGHT"
              components={{
                brand: <span className="text-label-primary">Celestial CMS</span>,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
