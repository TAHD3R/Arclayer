import { createRootRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";

import { SceneLoadingOverlay } from "@/components/layout/scene-loading-overlay";
import { useSceneRevealTransition } from "@/hooks/use-scene-reveal-transition";
import { isLoginPath, isPublicPath } from "@/lib/routing/route-identity";
import { getSceneLayout, resolveSceneKey } from "@/lib/routing/scene-registry";
import { isDevSetupOverrideEnabled, resolveSetupGateRedirect } from "@/lib/routing/setup-routing";
import { RouterDefaultError, RouterDefaultNotFound } from "@/components/builtin/router-fallbacks";
import { useAuthStore } from "@/stores/use-auth-store";
import { useSetupWizardStore } from "@/stores/use-setup-wizard-store";

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
      <Layout>
        <Outlet />
      </Layout>
      <SceneLoadingOverlay visible={overlayVisible} />
    </>
  );
}

export const Route = createRootRoute({
  beforeLoad: ({ location }) => {
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
      throw redirect({ to: "/" });
    }
  },
  component: RootLayout,
  errorComponent: RouterDefaultError,
  notFoundComponent: RouterDefaultNotFound,
});
