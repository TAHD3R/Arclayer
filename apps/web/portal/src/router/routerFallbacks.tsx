import type { ErrorComponentProps, NotFoundRouteProps } from "@tanstack/react-router";
import React from "react";

export function RouterDefaultNotFound(_props: NotFoundRouteProps) {
  return (
    <div className="portal-error">
      <h1>404</h1>
      <p>Page not found.</p>
    </div>
  );
}

export function RouterDefaultError(props: ErrorComponentProps) {
  const err = props.error;

  const status = err instanceof HttpError ? err.status : 500;
  const title = status === 403 ? "403" : status === 404 ? "404" : "500";
  const desc =
    status === 403 ? "Forbidden." : status === 404 ? "Page not found." : "Internal Server Error.";
  const isDev = import.meta.env.DEV;

  return (
    <div className="portal-error">
      <h1>{title}</h1>
      <p>{desc}</p>
      {isDev ? <pre>{String(err instanceof Error ? err.message : err)}</pre> : null}
    </div>
  );
}

export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}
