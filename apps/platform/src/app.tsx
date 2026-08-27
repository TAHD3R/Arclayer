import { ProgressProvider } from "@bprogress/react";
import { RouterProvider } from "@tanstack/react-router";

import { PlatformAuthProvider } from "@/auth/platform-auth";
import { PlatformPreferencesProvider } from "@/lib/preferences";
import { router } from "@/routes/-router";

export default function App() {
  return (
    <ProgressProvider color="var(--foreground)" height="2px">
      <PlatformPreferencesProvider>
        <PlatformAuthProvider>
          <RouterProvider router={router} />
        </PlatformAuthProvider>
      </PlatformPreferencesProvider>
    </ProgressProvider>
  );
}
