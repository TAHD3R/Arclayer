import type { MessageInstance } from "antd/es/message/interface";

import { i18n } from "@/lib/i18n";
import { ApiError } from "@/lib/http";

let messageApi: MessageInstance | null = null;

export function setMessageApi(api: MessageInstance | null) {
  messageApi = api;
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
  if (messageApi) {
    messageApi.error(text);
    return;
  }

  // Fallback: don't crash if message context isn't mounted yet.
  console.error(text, err);
}

export function notifyErrorText(text: string) {
  if (messageApi) {
    messageApi.error(text);
    return;
  }

  console.error(text);
}

export function notifyInfoText(text: string) {
  if (messageApi) {
    messageApi.info(text);
    return;
  }

  console.info(text);
}

export function notifySuccessText(text: string) {
  if (messageApi) {
    messageApi.success(text);
    return;
  }

  console.info(text);
}
