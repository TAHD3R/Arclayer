import React from "react";
import { createRootRoute, Outlet } from "@tanstack/react-router";

import "@/assets/index.css";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <div>
      <Outlet />
    </div>
  );
}
