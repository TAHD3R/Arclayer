import { z } from "zod";

import type { SetupAdminDraft, SetupDefaultsDraft, SetupSiteDraft } from "@/types/stores";

const SETUP_TEMPLATE_VALUES = ["blog", "website", "blank"] as const;

// Keep behavior aligned with backend PASSWORD_REGEX (apps/api/routers/v1/auth/constants.py).
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)[[A-Za-z\d~!@#$%^&*()_\-+=\]{}|;:'",.<>?/]{8,128}$/;

export function createSetupAdminSchema(t: (key: string) => string): z.ZodType<SetupAdminDraft> {
  return z
    .object({
      username: z.string().min(1, t("auth:VALIDATION_USERNAME_REQUIRED")),
      password: z
        .string()
        .min(1, t("auth:VALIDATION_PASSWORD_REQUIRED"))
        .refine((value) => PASSWORD_REGEX.test(value), t("auth:PASSWORD_INVALID")),
      confirmPassword: z.string().min(1, t("auth:VALIDATION_CONFIRM_PASSWORD_REQUIRED")),
      email: z
        .string()
        .min(1, t("auth:VALIDATION_EMAIL_REQUIRED"))
        .email(t("auth:VALIDATION_EMAIL_INVALID")),
      displayName: z
        .string()
        .min(1, t("setup:SETUP_VALIDATION_DISPLAY_NAME_REQUIRED"))
        .max(64, t("setup:SETUP_VALIDATION_DISPLAY_NAME_MAX")),
    })
    .superRefine((value, ctx) => {
      if (value.password === value.confirmPassword) return;
      ctx.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: t("auth:VALIDATION_PASSWORD_MISMATCH"),
      });
    });
}

export function createSetupSiteSchema(t: (key: string) => string): z.ZodType<SetupSiteDraft> {
  return z.object({
    templateKey: z.enum(SETUP_TEMPLATE_VALUES, {
      error: () => t("setup:SETUP_VALIDATION_TEMPLATE_REQUIRED"),
    }),
    workspaceName: z.string().min(1, t("setup:SETUP_VALIDATION_WORKSPACE_NAME_REQUIRED")),
    siteName: z.string().min(1, t("setup:SETUP_VALIDATION_SITE_NAME_REQUIRED")),
    siteUrl: z
      .string()
      .min(1, t("setup:SETUP_VALIDATION_SITE_URL_REQUIRED"))
      .refine((value) => {
        try {
          const url = new URL(value.trim());
          return url.protocol === "http:" || url.protocol === "https:";
        } catch {
          return false;
        }
      }, t("setup:SETUP_VALIDATION_SITE_URL_INVALID")),
    siteDescription: z.string().max(160).optional().default(""),
  });
}

export function createSetupDefaultsSchema(
  t: (key: string) => string,
): z.ZodType<SetupDefaultsDraft> {
  return z.object({
    timezone: z.string().min(1, t("setup:SETUP_VALIDATION_TIMEZONE_REQUIRED")),
    locale: z.string().min(1, t("setup:SETUP_VALIDATION_LOCALE_REQUIRED")),
    dateFormat: z.string().min(1, t("setup:SETUP_VALIDATION_DATE_FORMAT_REQUIRED")),
    useBrowserTimeZone: z.boolean(),
    useRelativeDateTime: z.boolean(),
  }) as z.ZodType<SetupDefaultsDraft>;
}
