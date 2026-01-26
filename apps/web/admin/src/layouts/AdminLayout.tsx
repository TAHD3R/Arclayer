import { Link, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { Layout, Menu, Typography } from "antd";
import { type PropsWithChildren } from "react";

import { RouteProgress } from "@/core/ui/RouteProgress";

export function AdminLayout({ children }: PropsWithChildren) {
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
        <Layout.Content style={{ padding: 24 }}>{children ?? <Outlet />}</Layout.Content>
      </Layout>

      {import.meta.env.DEV ? <TanStackRouterDevtools position="bottom-right" /> : null}
    </Layout>
  );
}
