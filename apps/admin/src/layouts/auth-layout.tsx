import {
  createContext,
  lazy,
  Suspense,
  useContext,
  type PropsWithChildren,
  useMemo,
  useState,
} from "react";
import { Trans, useTranslation } from "react-i18next";
import { useRouterState } from "@tanstack/react-router";

import { AUTH_SCENE_BEND_PROPS } from "@/constants/color-bends";
import { AdminFullLogo } from "@/components/layout/admin-logo";
import { AdminLocaleToggle } from "@/components/layout/admin-toggle-locales";
import { AdminThemeModeToggle } from "@/components/layout/admin-toggle-theme";
import { LegalFooter } from "@/components/layout/legal-footer";
import { RouteTransition } from "@/components/layout/route-transition";
import { useLockViewport } from "@celestial/hooks/use-lock-viewport";
import { useMediaQuery } from "@celestial/hooks/use-media-query";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { isLoginPath } from "@/lib/routing/route-identity";

const ColorBendsLazy = lazy(() => import("@celestial/ui/color-bends"));

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
  const isLargeScreen = useMediaQuery("(min-width: 1024px)");

  const defaultLegalKey = useMemo(() => {
    if (isLoginPath(pathname)) return "auth:LEGAL_LOGIN";
    return null;
  }, [pathname]);
  const [legalKeyOverride, setLegalKeyOverride] = useState<string | null | undefined>(undefined);
  const legalKey = legalKeyOverride !== undefined ? legalKeyOverride : defaultLegalKey;
  const legalCtx = useMemo<AuthLegalContextValue>(
    () => ({ legalKey, setLegalKey: setLegalKeyOverride }),
    [legalKey],
  );

  useLockViewport();

  return (
    <div className="fixed inset-0 w-full overflow-hidden grid grid-cols-1 lg:grid-cols-2 bg-background text-label-primary">
      <div className="absolute top-0 inset-x-0 z-10 p-4 flex items-center justify-between pointer-events-none">
        <div className="pointer-events-auto">
          <AdminFullLogo to="/login" ariaLabel="Arclayer" width={120} />
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
            <ColorBendsLazy {...AUTH_SCENE_BEND_PROPS} />
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
                brand: <span className="text-label-primary">Arclayer</span>,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
