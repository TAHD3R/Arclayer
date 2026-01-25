import { createRootRoute, redirect } from "@tanstack/react-router";

import { AdminLayout } from "@/layouts/AdminLayout";
import { useAuthStore } from "@/stores/auth.store";

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
  component: AdminLayout,
});
