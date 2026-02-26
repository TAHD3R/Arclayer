import { createRootRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { useLayoutEffect, useRef, useState } from "react";

import { SceneLoadingOverlay } from "@/components/common/scene-loading-overlay";
import { AdminLayout } from "@/layouts/admin-layout";
import { AuthLayout } from "@/layouts/auth-layout";
import { EditorLayout } from "@/layouts/editor-layout";
import { InviteLayout } from "@/layouts/invite-layout";
import { SetupLayout } from "@/layouts/setup-layout";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { isOnboardingScenePath, resolveSetupGateRedirect } from "@/lib/setup-routing";
import { RouterDefaultError, RouterDefaultNotFound } from "@/pages/builtin/router-fallbacks";
import { useAuthStore } from "@/stores/use-auth-store";
import { useSetupWizardStore } from "@/stores/use-setup-wizard-store";

function isDevSetupOverrideEnabled(searchStr: string): boolean {
  if (!import.meta.env.DEV) return false;

  // Explicit opt-in only: keep behavior identical in production builds.
  try {
    const params = new URLSearchParams((searchStr || "").replace(/^\?/, ""));
    if (params.get("__dev_setup") === "1") return true;
  } catch {
    // ignore
  }

  try {
    return window.localStorage.getItem("celestial.dev.allow_setup") === "1";
  } catch {
    return false;
  }
}

/**
 * Manages a full-screen overlay that hides layout flicker during scene transitions.
 *
 * Flow:
 *  1. sceneKey changes → overlayVisible = true (instant cover)
 *  2. Next frame: displayedScene updates (layout swap hidden behind overlay)
 *  3. After layout swap: overlayVisible = false (200ms fade-out reveals new layout)
 */
function useSceneRevealTransition(sceneKey: string) {
  const reducedMotion = usePrefersReducedMotion();
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [displayedScene, setDisplayedScene] = useState(sceneKey);
  const prevSceneRef = useRef(sceneKey);

  useLayoutEffect(() => {
    if (prevSceneRef.current === sceneKey) return;
    prevSceneRef.current = sceneKey;

    if (reducedMotion) {
      setDisplayedScene(sceneKey);
      return;
    }

    // Step 1: show overlay immediately
    setOverlayVisible(true);

    // Step 2: swap layout behind the overlay on next frame
    requestAnimationFrame(() => {
      setDisplayedScene(sceneKey);
      // Step 3: reveal new layout after one more frame (layout has painted)
      requestAnimationFrame(() => {
        setOverlayVisible(false);
      });
    });
  }, [reducedMotion, sceneKey]);

  return { displayedScene, overlayVisible };
}

function RootLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isOnboardingRoute = isOnboardingScenePath(pathname);
  const isAuthRoute = pathname === "/login" || pathname === "/reset-password";
  const isInviteRoute = pathname === "/accept-invite";
  const isEditorRoute = /^\/w\/[^/]+\/editor(?:\/|$)/.test(pathname);

  const sceneKey = isOnboardingRoute
    ? "setup"
    : isAuthRoute
      ? "auth"
      : isInviteRoute
        ? "invite"
        : isEditorRoute
          ? "editor"
          : "admin";

  const { displayedScene, overlayVisible } = useSceneRevealTransition(sceneKey);

  const layoutContent =
    displayedScene === "setup" ? (
      <SetupLayout>
        <Outlet />
      </SetupLayout>
    ) : displayedScene === "auth" ? (
      <AuthLayout>
        <Outlet />
      </AuthLayout>
    ) : displayedScene === "invite" ? (
      <InviteLayout>
        <Outlet />
      </InviteLayout>
    ) : displayedScene === "editor" ? (
      <EditorLayout>
        <Outlet />
      </EditorLayout>
    ) : (
      <AdminLayout>
        <Outlet />
      </AdminLayout>
    );

  return (
    <>
      {layoutContent}
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
    const isPublic =
      location.pathname === "/login" ||
      location.pathname === "/reset-password" ||
      location.pathname.startsWith("/setup") ||
      location.pathname === "/accept-invite";
    const isLogin = location.pathname === "/login";

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
