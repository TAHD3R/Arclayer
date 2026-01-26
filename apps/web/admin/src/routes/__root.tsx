import { createRootRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

import { AdminLayout } from "@/layouts/AdminLayout";
import { useAuthStore } from "@/stores/auth.store";

const AuthLayoutLazy = lazy(async () => {
  const mod = await import("@/layouts/AuthLayout");
  return { default: mod.AuthLayout };
});

function AuthLayoutFallback() {
  return (
    <div
      className="min-h-screen w-full flex items-center justify-center"
      style={{ background: "var(--color-background)", color: "var(--color-foreground)" }}
    >
      <div style={{ color: "var(--color-muted-foreground)", fontSize: 14 }}>Loading…</div>
    </div>
  );
}

function RootLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isAuthRoute = pathname === "/login";

  return isAuthRoute ? (
    <Suspense fallback={<AuthLayoutFallback />}>
      <AuthLayoutLazy>
        <Outlet />
      </AuthLayoutLazy>
    </Suspense>
  ) : (
    <AdminLayout>
      <Outlet />
    </AdminLayout>
  );
}

export const Route = createRootRoute({
  beforeLoad: ({ location }) => {
    const token = useAuthStore.getState().accessToken;
    const isLogin = location.pathname === "/login";

    if (!token && !isLogin) {
      throw redirect({
        to: "/login",
        // `location.search` is an object; use `searchStr` to keep it stable.
        search: { redirect: `${location.pathname}${location.searchStr}` },
      });
    }

    if (token && isLogin) {
      throw redirect({ to: "/" });
    }
  },
  component: RootLayout,
});
