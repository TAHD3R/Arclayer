"use client";

import * as React from "react";
import { getI18n } from "react-i18next";
import { toast, type ExternalToast } from "sonner";

type AdminToastType = "success" | "error" | "info" | "warning";

export type AdminToastContent =
  | React.ReactNode
  | {
      title: React.ReactNode;
      description?: React.ReactNode;
    };

function isStructuredToastContent(content: AdminToastContent): content is {
  title: React.ReactNode;
  description?: React.ReactNode;
} {
  if (content == null) {
    return false;
  }
  return typeof content === "object" && !React.isValidElement(content) && "title" in content;
}

function resolveDefaultToastTitle(type: AdminToastType): string {
  const key = {
    success: "TOAST_TITLE_SUCCESS",
    error: "TOAST_TITLE_ERROR",
    info: "TOAST_TITLE_INFO",
    warning: "TOAST_TITLE_WARNING",
  }[type];

  const i18n = getI18n();
  if (!i18n) {
    throw new Error("[admin-toast] i18n has not been initialized.");
  }

  return i18n.t(key, { ns: "common" });
}

function normalizeToastContent(type: AdminToastType, content: AdminToastContent) {
  if (isStructuredToastContent(content)) {
    return {
      title: content.title,
      description: content.description,
    };
  }

  return {
    title: resolveDefaultToastTitle(type),
    description: content ?? undefined,
  };
}

function dispatchToast(
  type: AdminToastType,
  trigger: (title: React.ReactNode, data?: ExternalToast) => string | number,
  content: AdminToastContent,
  data?: ExternalToast,
) {
  const normalized = normalizeToastContent(type, content);

  return trigger(normalized.title, {
    ...data,
    description: data?.description ?? normalized.description,
  });
}

const messageApi = {
  success: (content: AdminToastContent, data?: ExternalToast) =>
    dispatchToast("success", toast.success, content, data),
  error: (content: AdminToastContent, data?: ExternalToast) =>
    dispatchToast("error", toast.error, content, data),
  info: (content: AdminToastContent, data?: ExternalToast) =>
    dispatchToast("info", toast.info, content, data),
  warning: (content: AdminToastContent, data?: ExternalToast) =>
    dispatchToast("warning", toast.warning, content, data),
};

export const message = Object.assign(messageApi, {
  useMessage: () => [messageApi, null] as const,
});
