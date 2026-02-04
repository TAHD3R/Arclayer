import type { ErrorComponentProps, NotFoundRouteProps } from "@tanstack/react-router";

import { ApiError } from "@/lib/http";
import { getErrorMessage } from "@/lib/notifications";
import { useAuthStore } from "@/stores/use-auth-store";
import { ForbiddenView } from "@/pages/builtin/forbidden-page";
import { NotFoundView } from "@/pages/builtin/not-found-page";
import { ServerErrorView } from "@/pages/builtin/server-error-page";

export function RouterDefaultNotFound(_props: NotFoundRouteProps) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const variant = accessToken ? "admin" : "fullscreen";
  return <NotFoundView variant={variant} />;
}

export function RouterDefaultError(props: ErrorComponentProps) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const variant = accessToken ? "admin" : "fullscreen";

  const err = props.error;
  const details = getErrorMessage(err);

  if (err instanceof ApiError) {
    if (err.status === 403) {
      return <ForbiddenView variant={variant} details={details} />;
    }
  }

  return <ServerErrorView variant={variant} details={details} />;
}
