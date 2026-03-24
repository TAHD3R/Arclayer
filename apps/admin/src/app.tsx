import { RouterProvider } from "@tanstack/react-router";

import { AppProviders } from "@/lib/providers/app-providers";
import { router } from "@/routes/-router";

export default function App() {
  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
