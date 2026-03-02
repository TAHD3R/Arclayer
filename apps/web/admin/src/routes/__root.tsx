import { createRootRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";

import { SceneLoadingOverlay } from "@/components/layout/scene-loading-overlay";
import { useSceneRevealTransition } from "@/hooks/use-scene-reveal-transition";
import {
  isAuthScenePath,
  isDevToolsPath,
  isLoginPath,
  isPublicPath,
  isRepairPath,
} from "@/lib/routing/route-identity";
import { getSceneLayout, resolveSceneKey } from "@/lib/routing/scene-registry";
import { isDevSetupOverrideEnabled, resolveSetupGateRedirect } from "@/lib/routing/setup-routing";
import { RouterDefaultError, RouterDefaultNotFound } from "@/components/builtin/router-fallbacks";
import { RouteDocumentTitleManager } from "@/components/builtin/route-document-title-manager";
import { refresh as refreshTokens, refreshCookie as refreshCookieTokens } from "@/api/auth";
import { useAuthStore } from "@/stores/use-auth-store";
import { useSetupWizardStore } from "@/stores/use-setup-wizard-store";
import { consumeStudioReturnTo, resolveStudioOrigin } from "@/lib/routing/studio-return";

function normalizeEditorRedirectPath(redirectTo: string): string {
  // Vite `base` 通常配置为 `/editor/`，当落点是 `/editor`（无尾斜杠）时，
  // 服务器会直接返回提示文本而不是 SPA（导致看起来像 404）。
  if (redirectTo === "/editor") return "/editor/";
  if (redirectTo.startsWith("/editor?")) return `/editor/${redirectTo.slice("/editor".length)}`;
  if (redirectTo.startsWith("/editor#")) return `/editor/${redirectTo.slice("/editor".length)}`;
  return redirectTo;
}

function RootLayout() {
  const { pathname, isPagePending } = useRouterState({
    select: (s) => ({
      pathname: s.location.pathname,
      isPagePending: s.isLoading || s.matches.some((d) => d.status === "pending"),
    }),
    structuralSharing: true,
  });
  const sceneKey = resolveSceneKey(pathname);
  const { displayedScene, overlayVisible } = useSceneRevealTransition(sceneKey, { isPagePending });
  const Layout = getSceneLayout(displayedScene);

  return (
    <>
      <RouteDocumentTitleManager />
      <Layout>
        <Outlet />
      </Layout>
      <SceneLoadingOverlay visible={overlayVisible} />
    </>
  );
}

export const Route = createRootRoute({
  beforeLoad: async ({ location }) => {
    if (import.meta.env.DEV && isDevToolsPath(location.pathname)) {
      return;
    }

    const setup = useSetupWizardStore.getState();
    const devAllowSetup = isDevSetupOverrideEnabled(location.searchStr);

    const setupRedirect = resolveSetupGateRedirect({
      deploymentMode: setup.deploymentMode,
      initialized: setup.initialized,
      pathname: location.pathname,
      devAllowSetup,
    });
    if (setupRedirect) {
      throw redirect({ to: setupRedirect });
    }

    if (
      setup.repairRequired === true &&
      !isRepairPath(location.pathname) &&
      !isAuthScenePath(location.pathname)
    ) {
      throw redirect({ to: "/repair/master-key", replace: true });
    }

    const token = useAuthStore.getState().accessToken;
    const isPublic = isPublicPath(location.pathname);
    const isLogin = isLoginPath(location.pathname);

    if (!token && !isPublic) {
      throw redirect({
        to: "/login",
        // location.search is an object; use searchStr to keep it stable.
        search: { redirect: `${location.pathname}${location.searchStr}` },
      });
    }

    if (token && isLogin) {
      const studioReturnTo = consumeStudioReturnTo();
      if (studioReturnTo) {
        if (typeof window !== "undefined") {
          const refreshToken = useAuthStore.getState().refreshToken;
          try {
            // 1) Use refresh token (from storage) to mint/update the refresh cookie if enabled.
            if (refreshToken) {
              const tokens = await refreshTokens({ refresh_token: refreshToken });
              useAuthStore.getState().setTokens(tokens);
            }

            // 2) Verify cookie-based refresh works from the browser (prevents studio<->login loops).
            const cookieTokens = await refreshCookieTokens();
            useAuthStore.getState().setTokens(cookieTokens);
          } catch {
            // Avoid redirect loops when cookie session is disabled/misconfigured.
            throw redirect({ to: "/" });
          }

          const studioOrigin = resolveStudioOrigin();
          window.location.replace(`${studioOrigin}${studioReturnTo}`);
          return;
        }
      }

      const params = new URLSearchParams(location.searchStr);
      const redirectTo = params.get("redirect");
      if (
        typeof redirectTo === "string" &&
        redirectTo.startsWith("/") &&
        !redirectTo.startsWith("//")
      ) {
        const pathname = redirectTo.split("?")[0] || "";
        if (!isAuthScenePath(pathname)) {
          if (redirectTo.startsWith("/editor")) {
            if (typeof window !== "undefined") {
              window.location.replace(normalizeEditorRedirectPath(redirectTo));
              return;
            }
          }
          throw redirect({ to: redirectTo });
        }
      }
      throw redirect({ to: "/" });
    }
  },
  component: RootLayout,
  errorComponent: RouterDefaultError,
  notFoundComponent: RouterDefaultNotFound,
});
