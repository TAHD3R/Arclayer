import { createRootRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";

import { AdminLayout } from "@/layouts/AdminLayout";
import { AuthLayout } from "@/layouts/AuthLayout";
import { useAuthStore } from "@/stores/useAuthStore";

function RootLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isAuthRoute = pathname === "/login" || pathname === "/reset-password";

  return isAuthRoute ? (
    <AuthLayout>
      <Outlet />
    </AuthLayout>
  ) : (
    <AdminLayout>
      <Outlet />
    </AdminLayout>
  );
}

export const Route = createRootRoute({
  beforeLoad: ({ location }) => {
    const token = useAuthStore.getState().accessToken;
    const isPublic = location.pathname === "/login" || location.pathname === "/reset-password";
    const isLogin = location.pathname === "/login";

    if (!token && !isPublic) {
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
