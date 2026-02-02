export class ApiError extends Error {
  readonly status: number;
  readonly error?: string;
  readonly meta?: unknown;

  constructor(args: { status: number; message: string; error?: string; meta?: unknown }) {
    super(args.message);
    this.name = "ApiError";
    this.status = args.status;
    this.error = args.error;
    this.meta = args.meta;
  }
}
