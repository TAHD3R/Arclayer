"use client";

import * as React from "react";
import { getI18n } from "react-i18next";
import { CopyIcon } from "lucide-react";
import { toast, type ExternalToast } from "sonner";

import { Button } from "./button";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

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
  const [open, setOpen] = React.useState(false);
  const [copyState, setCopyState] = React.useState<"idle" | "copied" | "failed">("idle");
  const closeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);

  const clearCloseTimer = React.useCallback(() => {
    if (!closeTimerRef.current) return;
    clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  const openPopover = React.useCallback(() => {
    clearCloseTimer();
    setOpen(true);
  }, [clearCloseTimer]);

  const scheduleClose = React.useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      setOpen(false);
      setCopyState("idle");
      closeTimerRef.current = null;
    }, 120);
  }, [clearCloseTimer]);

  React.useEffect(() => clearCloseTimer, [clearCloseTimer]);

  const copyRequestId = React.useCallback(async () => {
    try {
      if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
        throw new Error("[admin-toast] Clipboard API is unavailable.");
      }
      await navigator.clipboard.writeText(props.requestId);
      setCopyState("copied");
    } catch (error) {
      setCopyState("failed");
      console.error("[admin-toast] Failed to copy request id.", error);
    }
  }, [props.requestId]);

  const copyLabel =
    copyState === "copied"
      ? resolveCommonTranslation("TOAST_REQUEST_ID_COPIED")
      : copyState === "failed"
        ? resolveCommonTranslation("TOAST_REQUEST_ID_COPY_FAILED")
        : resolveCommonTranslation("TOAST_REQUEST_ID_COPY");

  const popoverContainer =
    triggerRef.current?.closest("[data-sonner-toaster]") instanceof HTMLElement
      ? triggerRef.current.closest("[data-sonner-toaster]")
      : undefined;

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
      React.createElement(Popover, {
        open,
        onOpenChange: setOpen,
        children: [
          React.createElement(PopoverTrigger, {
            key: "request-id-trigger",
            asChild: true,
            children: React.createElement(
              "button",
              {
                ref: triggerRef,
                type: "button",
                "aria-label": hint,
                className:
                  "inline-flex size-4 items-center justify-center rounded-full text-[11px] font-semibold text-label-tertiary transition-colors hover:text-label-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                onPointerEnter: openPopover,
                onPointerLeave: scheduleClose,
                onFocus: openPopover,
                onBlur: scheduleClose,
                onClick: (event) => {
                  event.preventDefault();
                  openPopover();
                },
              },
              "?",
            ),
          }),
          React.createElement(PopoverContent, {
            key: "request-id-content",
            side: "top",
            align: "start",
            sideOffset: 8,
            container: popoverContainer,
            className: "grid w-80 max-w-[calc(100vw-2rem)] gap-3 p-3",
            onPointerEnter: openPopover,
            onPointerLeave: scheduleClose,
            onOpenAutoFocus: (event) => event.preventDefault(),
            onCloseAutoFocus: (event) => event.preventDefault(),
            children: React.createElement(
              React.Fragment,
              null,
              React.createElement(
                "div",
                { className: "grid gap-1.5" },
                React.createElement("p", { className: "text-callout text-label-secondary" }, hint),
              ),
              React.createElement(
                Button,
                {
                  type: "button",
                  size: "xs",
                  variant: "ghost",
                  className:
                    "w-fit gap-1.5 px-0 text-label-secondary hover:bg-transparent hover:text-label-primary",
                  onClick: copyRequestId,
                },
                React.createElement(CopyIcon, { className: "size-3.5" }),
                copyLabel,
              ),
            ),
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
