export interface ResponseModel<T> {
  message: string;
  data: T | null;
  error?: string;
  timestamp: number;
  meta?: Record<string, unknown> | null;
}
