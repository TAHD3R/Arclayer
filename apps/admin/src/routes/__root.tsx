import { createRootRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";

import { SceneLoadingOverlay } from "@/components/layout/scene-loading-overlay";
import { useSceneRevealTransition } from "@arclayer/hooks/use-scene-reveal-transition";
import { isAuthScenePath, isLoginPath, isPublicPath } from "@/lib/routing/route-identity";
import { getSceneLayout, resolveSceneKey } from "@/lib/routing/scene-registry";
import { RouterDefaultError, RouterDefaultNotFound } from "@/components/builtin/router-fallbacks";
import { RouteDocumentTitleManager } from "@/components/builtin/route-document-title-manager";
import { useAuthStore } from "@/stores/use-auth-store";
import { usePreferencesStore } from "@/stores/use-preference-store";

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
  const userReducedMotion = usePreferencesStore((s) => s.reduceMotion);
  const { displayedScene, overlayVisible } = useSceneRevealTransition(sceneKey, {
    isPagePending,
    userReducedMotion,
  });
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
