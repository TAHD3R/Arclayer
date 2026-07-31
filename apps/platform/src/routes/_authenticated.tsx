import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { usePlatformAuth } from "@/auth/platform-auth";
import { readPlatformSession } from "@/auth/platform-session";
import { PlatformShell } from "@/components/platform-shell";

function AuthenticatedPlatformShell() {
  const { session } = usePlatformAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!session) void navigate({ to: "/sign-in", replace: true });
  }, [navigate, session]);
  return session ? <PlatformShell /> : null;
}

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: () => {
    if (!readPlatformSession()) throw redirect({ to: "/sign-in" });
  },
  component: AuthenticatedPlatformShell,
});
