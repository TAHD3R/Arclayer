import { createRootRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { useLayoutEffect, useRef } from "react";

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

function useSceneRevealTransition(sceneKey: string) {
  const reducedMotion = usePrefersReducedMotion();
  const prevSceneRef = useRef(sceneKey);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (reducedMotion) {
      prevSceneRef.current = sceneKey;
      return;
    }

    const prevScene = prevSceneRef.current;
    prevSceneRef.current = sceneKey;
    if (prevScene === sceneKey) return;

    // Remove any previous overlay (for example rapid redirects).
    overlayRef.current?.remove();
    overlayRef.current = null;

    const overlay = document.createElement("div");
    overlayRef.current = overlay;
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.zIndex = "2147483646";
    overlay.style.pointerEvents = "none";
    // Match current theme background to avoid flashes during layout switches.
    overlay.style.background = window.getComputedStyle(document.body).backgroundColor;
    overlay.style.willChange = "clip-path, opacity";
    overlay.style.clipPath = "inset(0 0 0 0)";
    document.body.appendChild(overlay);

    const cleanup = () => {
      overlay.remove();
      if (overlayRef.current === overlay) overlayRef.current = null;
    };

    // Prefer a subtle LTR reveal so layout swaps (auth to admin) feel less abrupt.
    // Fall back to a quick fade if clip-path is unsupported.
    const supportsClip =
      typeof CSS !== "undefined" &&
      (CSS.supports("clip-path", "inset(0 0 0 0)") ||
        CSS.supports("-webkit-clip-path", "inset(0 0 0 0)"));

    if (!supportsClip || typeof overlay.animate !== "function") {
      overlay.style.opacity = "1";
      overlay.style.transition = "opacity 160ms ease-out";
      void overlay.getBoundingClientRect();
      requestAnimationFrame(() => {
        overlay.style.opacity = "0";
      });
      overlay.addEventListener("transitionend", cleanup, { once: true });
      window.setTimeout(cleanup, 260);
      return;
    }

    // Ensure initial state is painted before we start animating clip-path.
    void overlay.getBoundingClientRect();
    const anim = overlay.animate(
      { clipPath: ["inset(0 0 0 0)", "inset(0 0 0 100%)"] },
      { duration: 260, easing: "cubic-bezier(0.2, 0, 0, 1)", fill: "forwards" },
    );
    void anim.finished.then(cleanup, cleanup);
  }, [reducedMotion, sceneKey]);
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
  useSceneRevealTransition(sceneKey);

  return isOnboardingRoute ? (
    <SetupLayout>
      <Outlet />
    </SetupLayout>
  ) : isAuthRoute ? (
    <AuthLayout>
      <Outlet />
    </AuthLayout>
  ) : isInviteRoute ? (
    <InviteLayout>
      <Outlet />
    </InviteLayout>
  ) : isEditorRoute ? (
    <EditorLayout>
      <Outlet />
    </EditorLayout>
  ) : (
    <AdminLayout>
      <Outlet />
    </AdminLayout>
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
