"use client";

import * as React from "react";
import { toast } from "sonner";

const messageApi = {
  success: (content: React.ReactNode) => toast.success(content),
  error: (content: React.ReactNode) => toast.error(content),
  info: (content: React.ReactNode) => toast(content),
  warning: (content: React.ReactNode) => toast.warning(content),
};

export const message = Object.assign(messageApi, {
  useMessage: () => [messageApi, null] as const,
});
