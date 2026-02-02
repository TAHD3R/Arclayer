export class ApiError extends Error {
  readonly status: number;
  // With `exactOptionalPropertyTypes`, optional fields are "missing or string" (not "string | undefined").
  // Class instance fields cannot be truly "missing", so we store them as unions instead.
  readonly error: string | undefined;
  readonly meta: unknown | undefined;

  constructor(args: { status: number; message: string; error?: string; meta?: unknown }) {
    super(args.message);
    this.name = "ApiError";
    this.status = args.status;
    this.error = args.error;
    this.meta = args.meta;
  }
}
