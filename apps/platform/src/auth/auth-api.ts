import {
  platformBeginTotpSetup,
  platformBeginWebauthnAuthentication,
  platformBeginWebauthnRegistration,
  platformCompleteTotpChallenge,
  platformCompleteWebauthnAuthentication,
  platformCompleteWebauthnRegistration,
  platformConfirmTotpSetup,
  platformSignIn,
  type PlatformSessionIssuedOut,
  type PlatformSignInOut,
  type PlatformTotpSetupOut,
  type PlatformWebAuthnAuthenticationCredential,
  type PlatformWebAuthnAuthenticationBeginOut,
  type PlatformWebAuthnRegistrationCredential,
  type PlatformWebAuthnRegistrationBeginOut,
} from "@arclayer/platform-openapi";

import { platformApiClient } from "@/api/client";

type ApiEnvelope<T> = Readonly<{
  data?: T | null;
  error?: string | null;
  message?: string;
}>;

type SdkResult<T> = Readonly<{
  data?: ApiEnvelope<T>;
  error?: unknown;
  response?: Response;
}>;

export class PlatformAuthApiError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(code: string, status?: number) {
    super(code);
    this.name = "PlatformAuthApiError";
    this.code = code;
    this.status = status;
  }
}

function extractErrorCode(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (!value || typeof value !== "object") return null;
  const candidate = value as { error?: unknown; code?: unknown; message?: unknown };
  return (
    extractErrorCode(candidate.error) ??
    extractErrorCode(candidate.code) ??
    extractErrorCode(candidate.message)
  );
}

function unwrap<T>(result: SdkResult<T>): T {
  if (result.error !== undefined) {
    throw new PlatformAuthApiError(
      extractErrorCode(result.error) ?? "PLATFORM_AUTH_REQUEST_FAILED",
      result.response?.status,
    );
  }
  if (!result.data || result.data.error) {
    throw new PlatformAuthApiError(
      result.data?.error ?? "PLATFORM_AUTH_RESPONSE_INVALID",
      result.response?.status,
    );
  }
  if (!result.data.data) {
    throw new PlatformAuthApiError("PLATFORM_AUTH_RESPONSE_INVALID", result.response?.status);
  }
  return result.data.data;
}

export async function signInToPlatform(
  identifier: string,
  password: string,
): Promise<PlatformSignInOut> {
  return unwrap(
    await platformSignIn({ body: { identifier, password }, client: platformApiClient }),
  );
}

export async function beginAuthenticatorAppSetup(flowToken: string): Promise<PlatformTotpSetupOut> {
  return unwrap(await platformBeginTotpSetup({ body: { flowToken }, client: platformApiClient }));
}

export async function confirmAuthenticatorAppSetup(
  flowToken: string,
  methodId: string,
  code: string,
): Promise<PlatformSessionIssuedOut> {
  return unwrap(
    await platformConfirmTotpSetup({
      body: { flowToken, methodId, code },
      client: platformApiClient,
    }),
  );
}

export async function completeAuthenticatorAppChallenge(
  flowToken: string,
  methodId: string,
  code: string,
): Promise<PlatformSessionIssuedOut> {
  return unwrap(
    await platformCompleteTotpChallenge({
      body: { flowToken, methodId, code },
      client: platformApiClient,
    }),
  );
}

export async function beginSecurityKeySetup(
  flowToken: string,
): Promise<PlatformWebAuthnRegistrationBeginOut> {
  return unwrap(
    await platformBeginWebauthnRegistration({ body: { flowToken }, client: platformApiClient }),
  );
}

export async function completeSecurityKeySetup(
  flowToken: string,
  challengeId: string,
  credential: PlatformWebAuthnRegistrationCredential,
): Promise<PlatformSessionIssuedOut> {
  return unwrap(
    await platformCompleteWebauthnRegistration({
      body: { flowToken, challengeId, credential },
      client: platformApiClient,
    }),
  );
}

export async function beginSecurityKeyChallenge(
  flowToken: string,
): Promise<PlatformWebAuthnAuthenticationBeginOut> {
  return unwrap(
    await platformBeginWebauthnAuthentication({ body: { flowToken }, client: platformApiClient }),
  );
}

export async function completeSecurityKeyChallenge(
  flowToken: string,
  challengeId: string,
  credential: PlatformWebAuthnAuthenticationCredential,
): Promise<PlatformSessionIssuedOut> {
  return unwrap(
    await platformCompleteWebauthnAuthentication({
      body: { flowToken, challengeId, credential },
      client: platformApiClient,
    }),
  );
}

export function toPlatformAuthError(error: unknown): PlatformAuthApiError {
  if (error instanceof PlatformAuthApiError) return error;
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return new PlatformAuthApiError("PLATFORM_WEBAUTHN_CANCELLED");
  }
  if (error instanceof DOMException && error.name === "NotSupportedError") {
    return new PlatformAuthApiError("PLATFORM_WEBAUTHN_UNAVAILABLE");
  }
  if (error instanceof TypeError) return new PlatformAuthApiError("PLATFORM_NETWORK_ERROR");
  return new PlatformAuthApiError("PLATFORM_AUTH_UNEXPECTED");
}
