import { PlatformAccessApiError } from "@/access/access-api";

export function signInSettingsErrorKey(error: unknown, fallbackKey: string): string {
  if (!(error instanceof PlatformAccessApiError)) return fallbackKey;
  if (error.message === "PLATFORM_WEBAUTHN_CANCELLED") return "SECURITY_KEY_CANCELLED";
  if (
    error.message === "PLATFORM_WEBAUTHN_NOT_CONFIGURED" ||
    error.message === "PLATFORM_WEBAUTHN_UNAVAILABLE"
  )
    return "SECURITY_KEY_UNAVAILABLE";
  if (error.message === "PLATFORM_WEBAUTHN_METHOD_REQUIRED")
    return "SECURITY_KEY_ACTION_SETUP_REQUIRED";
  if (error.message === "PLATFORM_SIGN_IN_PROVIDER_CONFIGURATION_REQUIRED")
    return "PROVIDER_CONFIGURATION_REQUIRED";
  if (
    error.message === "PLATFORM_STEP_UP_POLICY_UNAVAILABLE" ||
    error.message === "PLATFORM_STEP_UP_NOT_REQUIRED"
  )
    return "SIGN_IN_SETTINGS_SECURITY_POLICY_ERROR";
  if (
    error.message === "PLATFORM_STEP_UP_CONTEXT_CHANGED" ||
    error.message === "PLATFORM_STEP_UP_IDEMPOTENCY_MISMATCH" ||
    error.message === "PLATFORM_STEP_UP_PROOF_CONSUMED" ||
    error.message === "PLATFORM_STEP_UP_PROOF_INVALIDATED" ||
    error.message === "PLATFORM_STEP_UP_PROOF_EXPIRED"
  )
    return "SIGN_IN_SETTINGS_VERIFICATION_EXPIRED";
  if (error.message === "PLATFORM_SIGN_IN_SETTINGS_REVISION_CONFLICT")
    return "SIGN_IN_SETTINGS_CONFLICT";
  if (error.status === 401 || error.status === 403) return "ACTION_PERMISSION_ERROR";
  if (error.status === 422) return "SIGN_IN_SETTINGS_VALIDATION_ERROR";
  return fallbackKey;
}
