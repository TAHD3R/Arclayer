import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { usernameCheck } from "@/api/auth";

export const ACCOUNT_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).{8,128}$/;

export function useDebouncedValue(value: string, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [delayMs, value]);

  return debouncedValue;
}

export function useUsernameAvailability(username: string, enabled: boolean) {
  const normalizedUsername = String(username || "").trim().toLowerCase();
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

export type PasswordStrengthFeedback = {
  tone: "default" | "success" | "danger";
  valid: boolean;
  message: string | null;
};

export function getPasswordStrengthFeedback(
  password: string,
  t: (key: string) => string,
): PasswordStrengthFeedback {
  if (!password) {
    return { tone: "default", valid: false, message: null };
  }

  if (password.length < 8 || password.length > 128) {
    return {
      tone: "danger",
      valid: false,
      message: t("auth:PASSWORD_STRENGTH_INVALID_LENGTH"),
    };
  }

  const hasLetter = /[A-Za-z]/.test(password);
  const hasDigit = /\d/.test(password);
  if (!hasLetter || !hasDigit) {
    return {
      tone: "danger",
      valid: false,
      message: t("auth:PASSWORD_STRENGTH_NEEDS_LETTER_AND_NUMBER"),
    };
  }

  const hasLowercase = /[a-z]/.test(password);
  const hasUppercase = /[A-Z]/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);
  const strong = password.length >= 12 && hasLowercase && hasUppercase && hasDigit && hasSymbol;

  return {
    tone: "success",
    valid: true,
    message: strong ? t("auth:PASSWORD_STRENGTH_STRONG") : t("auth:PASSWORD_STRENGTH_GOOD"),
  };
}
