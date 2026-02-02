import React from "react";
import { RouterProvider } from "@tanstack/react-router";

import type { PortalRouter } from "@/router";

export function PageShell(props: { router: PortalRouter }) {
  return <RouterProvider router={props.router} />;
}
