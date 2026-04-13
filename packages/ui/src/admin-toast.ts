"use client";

import * as React from "react";
import { toast, type ExternalToast } from "sonner";

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
  return (
    Boolean(content) &&
    typeof content === "object" &&
    !React.isValidElement(content) &&
    "title" in content
  );
}

function normalizeToastContent(content: AdminToastContent) {
  if (isStructuredToastContent(content)) {
    return {
      title: content.title,
      description: content.description,
    };
  }

  return {
    title: content,
    description: undefined,
  };
}

function dispatchToast(
  trigger: (title: React.ReactNode, data?: ExternalToast) => string | number,
  content: AdminToastContent,
  data?: ExternalToast,
) {
  const normalized = normalizeToastContent(content);

  return trigger(normalized.title, {
    ...data,
    description: data?.description ?? normalized.description,
  });
}

const messageApi = {
  success: (content: AdminToastContent, data?: ExternalToast) =>
    dispatchToast(toast.success, content, data),
  error: (content: AdminToastContent, data?: ExternalToast) =>
    dispatchToast(toast.error, content, data),
  info: (content: AdminToastContent, data?: ExternalToast) =>
    dispatchToast(toast.info, content, data),
  warning: (content: AdminToastContent, data?: ExternalToast) =>
    dispatchToast(toast.warning, content, data),
};

export const message = Object.assign(messageApi, {
  useMessage: () => [messageApi, null] as const,
});
