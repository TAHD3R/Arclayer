import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { usernameCheck } from "@/api/auth";
import { getErrorMessage } from "@/lib/error-message";
import { ApiError } from "@/lib/http";

export const ACCOUNT_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,128}$/;

export function resolveAuthFormError(error: unknown, fallback: string): string {
  const validationMessage = getAuthValidationDetails(error)[0]?.message;
  if (validationMessage) return validationMessage;
  return getErrorMessage(error, fallback);
}

export type AuthValidationDetail = {
  code: string;
  field: string;
  message: string;
};

export function getAuthValidationDetails(error: unknown): AuthValidationDetail[] {
  if (!(error instanceof ApiError) || error.error !== "VALIDATION_ERROR") return [];
  if (!isRecord(error.meta) || !Array.isArray(error.meta.details)) return [];

  return error.meta.details.flatMap((detail) => {
    if (!isRecord(detail) || !Array.isArray(detail.loc)) return [];
    const code = typeof detail.code === "string" ? detail.code : "";
    const message = typeof detail.message === "string" ? detail.message : "";
    const field = [...detail.loc].reverse().find((part) => typeof part === "string");
    if (!code || !message || typeof field !== "string") return [];
    return [{ code, field, message }];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function useDebouncedValue(value: string, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [delayMs, value]);

  return debouncedValue;
}

export function useUsernameAvailability(username: string, enabled: boolean) {
  const normalizedUsername = String(username || "")
    .trim()
    .toLowerCase();
  const debouncedUsername = useDebouncedValue(normalizedUsername, 350);
  const formatValid = ACCOUNT_NAME_PATTERN.test(debouncedUsername);

  const query = useQuery({
    queryKey: ["auth", "username-check", debouncedUsername],
    enabled: enabled && debouncedUsername.length > 0 && formatValid,
    queryFn: async () => usernameCheck({ username: debouncedUsername }),
    retry: false,
    staleTime: 10_000,
    meta: { silent: true },
  });

  return {
    debouncedUsername,
    formatValid,
    available: query.data?.available === true,
    unavailable: query.data?.available === false,
    isChecking: query.isFetching,
    isError: query.isError,
  };
}

export type PasswordRequirementKey = "length" | "letter" | "lowercase" | "uppercase" | "number";

export type PasswordRequirementState = {
  key: PasswordRequirementKey;
  label: string;
  met: boolean;
};

export function getPasswordRequirementStates(
  password: string,
  t: (key: string) => string,
): PasswordRequirementState[] {
  return [
    {
      key: "length",
      label: t("auth:PASSWORD_REQUIREMENT_LENGTH"),
      met: password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH,
    },
    {
      key: "lowercase",
      label: t("auth:PASSWORD_REQUIREMENT_LOWERCASE"),
      met: /[a-z]/.test(password),
    },
    {
      key: "uppercase",
      label: t("auth:PASSWORD_REQUIREMENT_UPPERCASE"),
      met: /[A-Z]/.test(password),
    },
    {
      key: "number",
      label: t("auth:PASSWORD_REQUIREMENT_NUMBER"),
      met: /\d/.test(password),
    },
  ];
}
