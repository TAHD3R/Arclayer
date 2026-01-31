import type { ErrorComponentProps, NotFoundRouteProps } from "@tanstack/react-router";

import { ApiError } from "@/lib/http";
import { getErrorMessage } from "@/utils/notifications";
import { useAuthStore } from "@/stores/useAuthStore";
import { ForbiddenView } from "@/views/_builtin/ForbiddenView";
import { NotFoundView } from "@/views/_builtin/NotFoundView";
import { ServerErrorView } from "@/views/_builtin/ServerErrorView";

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
