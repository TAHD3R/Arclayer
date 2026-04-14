import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { listMyWorkspaces } from "@/api/workspaces";
import { WorkspaceFirstOnboardingPage } from "@/pages/onboarding/workspace-first/page";
import { isPublicPath } from "@/lib/routing/route-identity";
import { useAuthStore } from "@/stores/use-auth-store";
import { Dialog, DialogContent } from "@arclayer/ui/dialog";

type WorkspaceFirstOnboardingOverlayHostProps = {
  pathname: string;
  onBlockingChange?: (blocking: boolean) => void;
};

export function WorkspaceFirstOnboardingOverlayHost({
  pathname,
  onBlockingChange,
}: WorkspaceFirstOnboardingOverlayHostProps) {
  const navigate = useNavigate();
  const accessToken = useAuthStore((state) => state.accessToken);
  const enabled = Boolean(accessToken) && !isPublicPath(pathname);

  const workspacesQuery = useQuery({
    queryKey: ["me", "workspaces", "onboarding"],
    queryFn: listMyWorkspaces,
    enabled,
    retry: false,
    meta: { silent: true },
  });

  const onboardingStatus = workspacesQuery.data?.onboarding?.status ?? "completed";
  const blocking =
    enabled &&
    (onboardingStatus === "pending_workspace" || onboardingStatus === "pending_workspace_defaults");

  useEffect(() => {
    onBlockingChange?.(blocking);
    return () => onBlockingChange?.(false);
  }, [blocking, onBlockingChange]);

  useEffect(() => {
    if (!blocking || pathname === "/") return;
    void navigate({ to: "/", replace: true });
  }, [blocking, navigate, pathname]);

  if (!blocking) return null;

  return (
    <Dialog open>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        className="w-full max-w-[calc(100dvw-2rem)] border-none bg-transparent p-0 shadow-none sm:max-w-3xl focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <WorkspaceFirstOnboardingPage />
      </DialogContent>
    </Dialog>
  );
}
