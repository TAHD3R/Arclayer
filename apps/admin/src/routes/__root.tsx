import { createRootRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { useState } from "react";

import { SceneLoadingOverlay } from "@/components/layout/scene-loading-overlay";
import { WorkspaceFirstOnboardingOverlayHost } from "@/components/layout/workspace-first-onboarding-overlay-host";
import { useSceneRevealTransition } from "@arclayer/hooks/use-scene-reveal-transition";
import { isAuthScenePath, isLoginPath, isPublicPath } from "@/lib/routing/route-identity";
import { resolvePostAuthRoute } from "@/lib/routing/post-auth-routing";
import { getSceneLayout, resolveSceneKey } from "@/lib/routing/scene-registry";
import { RouterDefaultError, RouterDefaultNotFound } from "@/components/builtin/router-fallbacks";
import { RouteDocumentTitleManager } from "@/components/builtin/route-document-title-manager";
import { useAuthStore } from "@/stores/use-auth-store";
import { usePreferencesStore } from "@/stores/use-preference-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

function normalizeEditorRedirectPath(redirectTo: string): string {
  // Vite `base` 通常配置为 `/editor/`，当落点是 `/editor`（无尾斜杠）时，
  // 服务器会直接返回提示文本而不是 SPA（导致看起来像 404）。
  if (redirectTo === "/editor") return "/editor/";
  if (redirectTo.startsWith("/editor?")) return `/editor/${redirectTo.slice("/editor".length)}`;
  if (redirectTo.startsWith("/editor#")) return `/editor/${redirectTo.slice("/editor".length)}`;
  return redirectTo;
}

export function RootLayout() {
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
  const [onboardingBlocking, setOnboardingBlocking] = useState(false);

  return (
    <>
      <RouteDocumentTitleManager />
      <div
        data-testid="root-scene-shell"
        aria-hidden={onboardingBlocking ? "true" : undefined}
        inert={onboardingBlocking}
      >
        <Layout>
          <Outlet />
        </Layout>
      </div>
      <WorkspaceFirstOnboardingOverlayHost
        pathname={pathname}
        onBlockingChange={setOnboardingBlocking}
      />
      <SceneLoadingOverlay visible={overlayVisible} />
    </>
  );
}

export const Route = createRootRoute({
  beforeLoad: async ({ location }) => {
    const token = useAuthStore.getState().accessToken;
    const isPublic = isPublicPath(location.pathname);
    const isLogin = isLoginPath(location.pathname);
    const workspaceState = useWorkspaceStore.getState();

    if (!token && !isPublic) {
      throw redirect({
        to: "/login",
        // location.search is an object; use searchStr to keep it stable.
        search: { redirect: `${location.pathname}${location.searchStr}` },
      });
    }

    if (token && !isPublic && location.pathname !== "/") {
      const decision = await resolvePostAuthRoute({
        lastWorkspaceId: workspaceState.lastWorkspaceId,
      });
      if (decision.onboardingRequired) {
        throw redirect({ to: "/" });
      }
    }

    if (token && isLogin) {
      const params = new URLSearchParams(location.searchStr);
      const redirectTo = params.get("redirect");
      const decision = await resolvePostAuthRoute({
        lastWorkspaceId: workspaceState.lastWorkspaceId,
      });
      if (decision.workspaceId) {
        workspaceState.setCurrentWorkspaceId(decision.workspaceId);
      }
      if (
        typeof redirectTo === "string" &&
        redirectTo.startsWith("/") &&
        !redirectTo.startsWith("//")
      ) {
        const pathname = redirectTo.split("?")[0] || "";
        if (!isAuthScenePath(pathname) && !decision.onboardingRequired) {
          if (redirectTo.startsWith("/editor")) {
            if (typeof window !== "undefined") {
              window.location.replace(normalizeEditorRedirectPath(redirectTo));
              return;
            }
          }
          throw redirect({ to: redirectTo });
        }
      }
      throw redirect({ to: decision.path });
    }
  },
  component: RootLayout,
  errorComponent: RouterDefaultError,
  notFoundComponent: RouterDefaultNotFound,
});
