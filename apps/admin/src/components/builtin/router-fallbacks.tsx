import type { ErrorComponentProps, NotFoundRouteProps } from "@tanstack/react-router";

import { ApiError } from "@/lib/http";
import { useAuthStore } from "@/stores/use-auth-store";
import { ForbiddenView } from "@/components/builtin/forbidden-page";
import { NotFoundView } from "@/components/builtin/not-found-page";
import { ServerErrorView } from "@/components/builtin/server-error-page";
import { UnauthorizedView } from "@/components/builtin/unauthorized-page";

export function RouterDefaultNotFound(_props: NotFoundRouteProps) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const historyIndex =
    typeof window !== "undefined" ? (window.history.state as any)?.__TSR_index : undefined;
  // When the user lands on a non-existing route via the address bar / external jump,
  // the current history entry is typically the first one (index=0). In that case we
  // prefer a fullscreen error so the broken URL doesn't render under AdminLayout shell.
  const variant = accessToken && historyIndex !== 0 ? "admin" : "fullscreen";

  return <NotFoundView variant={variant} />;
}

export function RouterDefaultError(props: ErrorComponentProps) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const variant = accessToken ? "admin" : "fullscreen";
  const err = props.error;

  if (err instanceof ApiError) {
    if (err.status === 401) {
      return <UnauthorizedView variant="fullscreen" />;
    }
    if (err.status === 403) {
      return <ForbiddenView variant={variant} />;
    }
  }

  return <ServerErrorView variant={variant} />;
}
