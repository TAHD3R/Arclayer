import { Link, Outlet, createRootRoute, redirect } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { Layout, Menu, Typography } from "antd";

import { RouteProgress } from "@/app/ui/RouteProgress";
import { useAuthStore } from "@/stores/auth.store";

function RootLayout() {
  return (
    <Layout style={{ minHeight: "100vh" }}>
      <RouteProgress />
      <Layout.Sider width={240} theme="light">
        <div style={{ padding: 16 }}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            Celestial Admin
          </Typography.Title>
        </div>
        <Menu
          mode="inline"
          items={[
            {
              key: "dashboard",
              label: <Link to="/">Dashboard</Link>,
            },
            {
              key: "login",
              label: <Link to="/login">Login</Link>,
            },
          ]}
        />
      </Layout.Sider>

      <Layout>
        <Layout.Content style={{ padding: 24 }}>
          <Outlet />
        </Layout.Content>
      </Layout>

      {import.meta.env.DEV ? <TanStackRouterDevtools position="bottom-right" /> : null}
    </Layout>
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
