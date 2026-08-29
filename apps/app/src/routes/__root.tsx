import {
  createRootRoute,
  Outlet,
  redirect,
  useRouterState,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { AccessRestrictionBoundary } from "@/components/builtin/access-restriction-boundary";
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

function projectContextForRoute(pathname: string, currentProjectId: string | null): string | null {
  const routeProjectId = pathname.match(/^\/projects\/([^/]+)(?:\/|$)/)?.[1] ?? null;
  return routeProjectId !== null && routeProjectId === currentProjectId ? currentProjectId : null;
}

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
  const routerState = useRouterState();
  const { pathname, searchStr } = routerState.location;
  const isPagePending =
    routerState.isLoading || routerState.matches.some((match) => match.status === "pending");
  const errorMatch = routerState.matches.find(
    (match) => (match as { status?: string }).status === "error",
  ) as { error?: Error } | undefined;
  const routeError = errorMatch?.error;
  const hasRouteError = Boolean(errorMatch);
  // TanStack Router flips `location` to the destination the moment a navigation
  // starts, while `matches` (what <Outlet /> renders) only switch inside the
  // commit. Branching the shell on the optimistic pathname renders a mixed
  // "new shell + old content" frame while pending — e.g. the admin sidebar
  // vanishing before the /welcome view transition even starts. Derive the shell
  // pathname from the rendered match chain so the shell swaps in the same
  // commit as the content.
  const renderedMatches = routerState.matches;
  const renderedPathname = renderedMatches[renderedMatches.length - 1]?.pathname ?? pathname;
  const isWelcome = isWelcomePath(renderedPathname);
  const sceneKey = resolveSceneKey(renderedPathname, searchStr);
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

  if (hasRouteError) {
    return (
      <SettingsScreenProvider>
        <RouteDocumentTitleManager />
        <AccessRestrictionBoundary pathname={pathname}>
          <RouterDefaultError error={routeError!} variant="fullscreen" />
        </AccessRestrictionBoundary>
      </SettingsScreenProvider>
    );
  }

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
      <AccessRestrictionBoundary pathname={pathname}>
        <div data-testid="root-scene-shell">
          <Layout>
            <Outlet />
          </Layout>
        </div>
        <UsercenterOverlayHost />
        <SceneLoadingOverlay visible={overlayVisible} />
      </AccessRestrictionBoundary>
    </SettingsScreenProvider>
  );
}

function RootRouteError(props: ErrorComponentProps) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return (
    <AccessRestrictionBoundary pathname={pathname}>
      <RouterDefaultError error={props.error} variant="fullscreen" />
    </AccessRestrictionBoundary>
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
    const welcomeSearch = new URLSearchParams(location.searchStr);
    const createWorkspaceWelcome = isWelcome && welcomeSearch.get("mode") === "create-workspace";
    const invitationWelcome = isWelcome && welcomeSearch.get("mode") === "invitation";

    if (!token && !isPublic) {
      throw redirect({
        to: "/login",
        // location.search is an object; use searchStr to keep it stable.
        search: { redirect: `${location.pathname}${location.searchStr}` },
      });
    }

    if (token && (dryRunWelcome || createWorkspaceWelcome || invitationWelcome)) {
      return;
    }

    if (token && !isPublic) {
      const decision = await resolvePostAuthRoute({
        lastWorkspaceId: workspaceState.lastWorkspaceId,
      });
      workspaceState.setCurrentContext({
        workspaceId: decision.workspaceId,
        projectId: projectContextForRoute(location.pathname, workspaceState.currentProjectId),
      });
      if (decision.onboardingRequired) {
        if (!isWelcome) {
          throw redirect({ to: "/welcome" });
        }
        return;
      }
      if (isWelcome && !dryRunWelcome) {
        const redirectTo = welcomeSearch.get("redirect");
        if (
          typeof redirectTo === "string" &&
          redirectTo.startsWith("/") &&
          !redirectTo.startsWith("//")
        ) {
          throw redirect({ to: redirectTo });
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
      workspaceState.setCurrentContext({
        workspaceId: decision.workspaceId,
        projectId: projectContextForRoute(location.pathname, workspaceState.currentProjectId),
      });
      if (decision.onboardingRequired) {
        const safeRedirect =
          typeof redirectTo === "string" &&
          redirectTo.startsWith("/") &&
          !redirectTo.startsWith("//")
            ? redirectTo
            : null;
        throw redirect({
          to: "/welcome",
          ...(safeRedirect ? { search: { redirect: safeRedirect } } : {}),
        });
      }
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
      throw redirect({ to: decision.path });
    }
  },
  component: RootLayout,
  errorComponent: RootRouteError,
  notFoundComponent: RouterDefaultNotFound,
});
