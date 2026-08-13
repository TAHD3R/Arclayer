import { ApiError } from "@/lib/http";
import { i18n } from "@/lib/i18n";

function translateErrorCode(errorCode: string): string | null {
  const translated = i18n.t(errorCode, { ns: "errors" });
  if (!translated || translated === errorCode) return null;
  return translated;
}

export function getErrorMessage(error: unknown, fallback?: string): string {
  const fallbackMessage = fallback ?? i18n.t("REQUEST_FAILED", { ns: "errors" });
  if (error instanceof ApiError) {
    if (error.error) return translateErrorCode(error.error) ?? fallbackMessage;
    return fallbackMessage;
  }

  if (error instanceof Error) return fallback ?? error.message;

  return fallbackMessage;
}
