export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

export type AbortStatusCode = 401 | 403 | 404 | 410 | 429 | 500 | 503;

export function toAbortStatus(status: number): AbortStatusCode {
  if (
    status === 401 ||
    status === 403 ||
    status === 404 ||
    status === 410 ||
    status === 429 ||
    status === 500 ||
    status === 503
  ) {
    return status;
  }
  return 500;
}
