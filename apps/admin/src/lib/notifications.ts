import { message } from "@arclayer/ui/admin-toast";

import { i18n } from "@/lib/i18n";
import { ApiError } from "@/lib/http";

export function setMessageApi(api: unknown) {
  void api;
}

function translateErrorCode(errorCode: string): string | null {
  // i18next returns the key itself when missing; treat that as "not translated".
  const translated = i18n.t(errorCode, { ns: "errors" });
  if (!translated || translated === errorCode) return null;
  return translated;
}

export function getErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.error) return translateErrorCode(err.error) ?? err.message;
    return err.message;
  }

  if (err instanceof Error) return err.message;

  return i18n.t("REQUEST_FAILED", { ns: "errors" });
}

export function notifyError(err: unknown) {
  const text = getErrorMessage(err);
  message.error({
    title: i18n.t("TOAST_TITLE_ERROR", { ns: "common" }),
    description: text,
  });
  console.error(text, err);
}

export function notifyErrorText(text: string) {
  message.error({
    title: i18n.t("TOAST_TITLE_ERROR", { ns: "common" }),
    description: text,
  });
  console.error(text);
}

export function notifyInfoText(text: string) {
  message.info({
    title: i18n.t("TOAST_TITLE_INFO", { ns: "common" }),
    description: text,
  });
  console.info(text);
}

export function notifySuccessText(text: string) {
  message.success({
    title: i18n.t("TOAST_TITLE_SUCCESS", { ns: "common" }),
    description: text,
  });
  console.info(text);
}
