"use client";

import * as React from "react";
import { getI18n } from "react-i18next";
import { toast, type ExternalToast } from "sonner";

import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

type AdminToastType = "success" | "error" | "info" | "warning";

type StructuredAdminToastContent = {
  title: React.ReactNode;
  description?: React.ReactNode;
  requestId?: string;
};

export type AdminToastContent = React.ReactNode | StructuredAdminToastContent;

function resolveCommonTranslation(key: string, options?: Record<string, unknown>): string {
  const i18n = getI18n();
  if (!i18n) {
    throw new Error("[admin-toast] i18n has not been initialized.");
  }

  return i18n.t(key, { ns: "common", ...options });
}

function isStructuredToastContent(
  content: AdminToastContent,
): content is StructuredAdminToastContent {
  if (content == null) {
    return false;
  }
  return typeof content === "object" && !React.isValidElement(content) && "title" in content;
}

function ToastDescription(props: { description?: React.ReactNode; requestId: string }) {
  const hint = resolveCommonTranslation("TOAST_REQUEST_ID_TOOLTIP");

  return React.createElement(
    "div",
    { className: "grid gap-1" },
    props.description ? React.createElement("div", null, props.description) : null,
    React.createElement(
      "div",
      { className: "inline-flex items-center gap-1 text-label-tertiary" },
      React.createElement(
        "span",
        null,
        resolveCommonTranslation("TOAST_REQUEST_ID_VALUE", { id: props.requestId }),
      ),
      React.createElement(Tooltip, {
        side: "top",
        align: "center",
        children: [
          React.createElement(TooltipTrigger, {
            asChild: true,
            focusTrigger: false,
            children: React.createElement(
              "button",
              {
                type: "button",
                "aria-label": hint,
                className:
                  "inline-flex size-4 items-center justify-center rounded-full text-[11px] font-semibold text-label-tertiary transition-colors hover:text-label-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              },
              "?",
            ),
          }),
          React.createElement(TooltipContent, {
            className: "max-w-64",
            children: hint,
          }),
        ],
      }),
    ),
  );
}

function resolveDefaultToastTitle(type: AdminToastType): string {
  const key = {
    success: "TOAST_TITLE_SUCCESS",
    error: "TOAST_TITLE_ERROR",
    info: "TOAST_TITLE_INFO",
    warning: "TOAST_TITLE_WARNING",
  }[type];

  return resolveCommonTranslation(key);
}

function normalizeToastContent(type: AdminToastType, content: AdminToastContent) {
  if (isStructuredToastContent(content)) {
    return {
      title: content.title,
      description: content.description,
      requestId: content.requestId,
    };
  }

  return {
    title: resolveDefaultToastTitle(type),
    description: content ?? undefined,
    requestId: undefined,
  };
}

function resolveToastDescription(
  type: AdminToastType,
  description: ExternalToast["description"] | undefined,
  requestId: string | undefined,
) {
  if (!requestId || (type !== "warning" && type !== "error")) {
    return description;
  }

  const descriptionNode = typeof description === "function" ? description() : description;

  return React.createElement(ToastDescription, { description: descriptionNode, requestId });
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
    description: resolveToastDescription(
      type,
      data?.description ?? normalized.description,
      normalized.requestId,
    ),
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
