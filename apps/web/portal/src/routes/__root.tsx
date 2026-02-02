import React from "react";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";

import "@/assets/index.css";
import type { PortalRouteContext } from "@/router";

export const Route = createRootRouteWithContext<PortalRouteContext>()({
  component: RootLayout,
});

function RootLayout() {
  return (
    <div>
      <Outlet />
    </div>
  );
}
