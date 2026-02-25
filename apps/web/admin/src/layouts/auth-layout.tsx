import {
  createContext,
  lazy,
  Suspense,
  useContext,
  type PropsWithChildren,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Trans, useTranslation } from "react-i18next";
import { useRouterState } from "@tanstack/react-router";

import { getAppConfig } from "@/constants/app-config";
import { AdminFullLogo } from "@/components/common/admin-logo";
import { AdminLocaleToggle } from "@/components/common/admin-toggle-locales";
import { AdminThemeModeToggle } from "@/components/common/admin-toggle-theme";
import { LegalFooter } from "@/components/common/legal-footer";
import { RouteTransition } from "@/components/common/route-transition";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

const ColorBendsLazy = lazy(() => import("@/components/ui/color-bends"));
const AUTH_BEND_COLORS = ["#3b82f6"] as const;

interface AuthLegalContextValue {
  legalKey: string | null;
  setLegalKey: (key: string | null) => void;
}

const AuthLegalContext = createContext<AuthLegalContextValue>({
  legalKey: null,
  setLegalKey: () => {},
});

export function useAuthLegalKey() {
  return useContext(AuthLegalContext);
}

export function AuthLayout({ children }: PropsWithChildren) {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const reducedMotion = usePrefersReducedMotion();
  const [isLargeScreen, setIsLargeScreen] = useState(false);

  // Legal disclaimer key — default inferred from pathname, overridable by child pages via context.
  const defaultLegalKey = useMemo(() => {
    if (pathname === "/login") return "auth:LEGAL_LOGIN";
    // reset-password is not a login/signup action — no legal disclaimer needed.
    return null;
  }, [pathname]);
  const [legalKeyOverride, setLegalKeyOverride] = useState<string | null | undefined>(undefined);
  const legalKey = legalKeyOverride !== undefined ? legalKeyOverride : defaultLegalKey;
  const legalCtx = useMemo<AuthLegalContextValue>(
    () => ({ legalKey, setLegalKey: setLegalKeyOverride }),
    [legalKey],
  );

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
    <div className="fixed inset-0 w-full overflow-hidden grid grid-cols-1 lg:grid-cols-2 bg-background text-label-primary">
      <div className="absolute top-0 inset-x-0 z-10 p-4 flex items-center justify-between pointer-events-none">
        <div className="pointer-events-auto">
          <AdminFullLogo to="/login" ariaLabel="Celestial CMS" width={120} />
        </div>
        <div className="flex items-center gap-2 pointer-events-auto">
          <AdminLocaleToggle />
          <AdminThemeModeToggle />
        </div>
      </div>

      <div className="relative hidden lg:block min-h-0 h-full overflow-hidden bg-background">
        {isLargeScreen && !reducedMotion ? (
          <Suspense
            fallback={<div className="absolute inset-0 bg-background animate-pulse opacity-50" />}
          >
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
            <div className="text-largetitle">{t("auth:SLOGAN_TITLE")}</div>
            <p className="text-title2 text-label-secondary">{t("auth:SLOGAN_SUBTITLE")}</p>
          </div>
        </div>
      </div>

      <div className="relative flex flex-col min-h-0 h-full overflow-hidden ">
        <div className="flex-1 min-h-0 flex items-center justify-center overflow-hidden p-8">
          <div className="w-full max-w-90">
            <AuthLegalContext.Provider value={legalCtx}>
              <RouteTransition className="w-full" variant="fade">
                {children}
              </RouteTransition>
            </AuthLegalContext.Provider>
          </div>
        </div>

        <div className="p-4 text-center space-y-1">
          {legalKey ? <LegalFooter i18nKey={legalKey} /> : null}
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
