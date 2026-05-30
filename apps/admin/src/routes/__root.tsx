import { createRootRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { SceneLoadingOverlay } from "@/components/layout/scene-loading-overlay";
import { SettingsScreenProvider } from "@/components/layout/settings-screen-provider";
import { UsercenterOverlayHost } from "@/components/layout/usercenter-overlay-host";
import {
  isAuthScenePath,
  isLoginPath,
  isPublicPath,
  isWelcomePath,
} from "@/lib/routing/route-identity";
import { resolvePostAuthRoute } from "@/lib/routing/post-auth-routing";
import { getSceneLayout, resolveSceneKey } from "@/lib/routing/scene-registry";
import { RouterDefaultError, RouterDefaultNotFound } from "@/components/builtin/router-fallbacks";
import { RouteDocumentTitleManager } from "@/components/builtin/route-document-title-manager";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

type SceneKey = ReturnType<typeof resolveSceneKey>;

const ADMIN_SHELL_SCENES = new Set<SceneKey>(["global", "admin"]);

export function shouldUseSceneLoadingOverlay(previousScene: SceneKey, nextScene: SceneKey) {
  if (ADMIN_SHELL_SCENES.has(previousScene) && ADMIN_SHELL_SCENES.has(nextScene)) return false;
  return true;
}

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
  const isWelcome = isWelcomePath(pathname);
  const sceneKey = resolveSceneKey(pathname);
  const lastResolvedSceneRef = useRef(sceneKey);
  const Layout = getSceneLayout(sceneKey);
  const overlayVisible =
    isPagePending &&
    lastResolvedSceneRef.current !== sceneKey &&
    shouldUseSceneLoadingOverlay(lastResolvedSceneRef.current, sceneKey);

  useEffect(() => {
    if (isPagePending) return;
    lastResolvedSceneRef.current = sceneKey;
  }, [isPagePending, sceneKey]);

  if (isWelcome) {
    return (
      <SettingsScreenProvider>
        <RouteDocumentTitleManager />
        <Outlet />
      </SettingsScreenProvider>
    );
  }

  return (
    <SettingsScreenProvider>
      <RouteDocumentTitleManager />
      <>
        <div data-testid="root-scene-shell">
          <Layout>
            <Outlet />
          </Layout>
        </div>
        <UsercenterOverlayHost />
        <SceneLoadingOverlay visible={overlayVisible} />
      </>
    </SettingsScreenProvider>
  );
}

export const Route = createRootRoute({
  beforeLoad: async ({ location }) => {
    const token = useAuthStore.getState().accessToken;
    const isPublic = isPublicPath(location.pathname);
    const isLogin = isLoginPath(location.pathname);
    const isWelcome = isWelcomePath(location.pathname);
    const workspaceState = useWorkspaceStore.getState();
    const dryRunWelcome =
      isWelcome &&
      import.meta.env.DEV &&
      new URLSearchParams(location.searchStr).get("dryRun") === "1";
    const createWorkspaceWelcome =
      isWelcome && new URLSearchParams(location.searchStr).get("mode") === "create-workspace";

    if (!token && !isPublic) {
      throw redirect({
        to: "/login",
        // location.search is an object; use searchStr to keep it stable.
        search: { redirect: `${location.pathname}${location.searchStr}` },
      });
    }

    if (token && (dryRunWelcome || createWorkspaceWelcome)) {
      return;
    }

    if (token && !isPublic) {
      const decision = await resolvePostAuthRoute({
        lastWorkspaceId: workspaceState.lastWorkspaceId,
      });
      if (decision.onboardingRequired) {
        if (!isWelcome) {
          throw redirect({ to: "/welcome" });
        }
        return;
      }
      if (isWelcome && !dryRunWelcome) {
        if (decision.workspaceId || decision.projectId) {
          workspaceState.setCurrentContext({
            workspaceId: decision.workspaceId,
            projectId: decision.projectId,
          });
        }
        throw redirect({ to: decision.path });
      }
    }

    if (token && isLogin) {
      const params = new URLSearchParams(location.searchStr);
      const redirectTo = params.get("redirect");
      const decision = await resolvePostAuthRoute({
        lastWorkspaceId: workspaceState.lastWorkspaceId,
      });
      if (decision.workspaceId || decision.projectId) {
        workspaceState.setCurrentContext({
          workspaceId: decision.workspaceId,
          projectId: decision.projectId,
        });
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
