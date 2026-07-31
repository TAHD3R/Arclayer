import type {
  PlatformWebAuthnAuthenticationCredential,
  PlatformWebAuthnAuthenticationOptions,
  PlatformWebAuthnCredentialDescriptor,
  PlatformWebAuthnRegistrationCredential,
  PlatformWebAuthnRegistrationOptions,
} from "@arclayer/platform-openapi";

const AUTHENTICATOR_TRANSPORTS = new Set<AuthenticatorTransport>([
  "ble",
  "hybrid",
  "internal",
  "nfc",
  "usb",
]);

function decodeBase64Url(value: string): ArrayBuffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = window.atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0)).buffer;
}

function encodeBase64Url(value: ArrayBuffer): string {
  const bytes = new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function toTransports(values?: Array<string>): AuthenticatorTransport[] | undefined {
  const transports = values?.filter((value): value is AuthenticatorTransport =>
    AUTHENTICATOR_TRANSPORTS.has(value as AuthenticatorTransport),
  );
  return transports?.length ? transports : undefined;
}

function toCredentialDescriptor(
  descriptor: PlatformWebAuthnCredentialDescriptor,
): PublicKeyCredentialDescriptor {
  return {
    id: decodeBase64Url(descriptor.id),
    transports: toTransports(descriptor.transports),
    type: "public-key",
  };
}

function requireWebAuthn(): void {
  if (!("PublicKeyCredential" in window) || !navigator.credentials) {
    throw new DOMException("WebAuthn is unavailable", "NotSupportedError");
  }
}

export async function createPlatformSecurityKey(
  options: PlatformWebAuthnRegistrationOptions,
): Promise<PlatformWebAuthnRegistrationCredential> {
  requireWebAuthn();
  const credential = await navigator.credentials.create({
    publicKey: {
      attestation: options.attestation,
      authenticatorSelection: options.authenticatorSelection,
      challenge: decodeBase64Url(options.challenge),
      excludeCredentials: options.excludeCredentials?.map(toCredentialDescriptor),
      pubKeyCredParams: options.pubKeyCredParams.map((parameter) => ({
        alg: parameter.alg,
        type: "public-key" as const,
      })),
      rp: options.rp,
      timeout: options.timeout,
      user: { ...options.user, id: decodeBase64Url(options.user.id) },
    },
  });
  if (!(credential instanceof PublicKeyCredential)) {
    throw new DOMException("Security-key setup did not return a credential", "NotAllowedError");
  }
  const response = credential.response as AuthenticatorAttestationResponse;
  return {
    id: credential.id,
    rawId: encodeBase64Url(credential.rawId),
    type: "public-key",
    response: {
      attestationObject: encodeBase64Url(response.attestationObject),
      clientDataJSON: encodeBase64Url(response.clientDataJSON),
      transports:
        typeof response.getTransports === "function" ? response.getTransports() : undefined,
    },
  };
}

export async function getPlatformSecurityKey(
  options: PlatformWebAuthnAuthenticationOptions,
): Promise<PlatformWebAuthnAuthenticationCredential> {
  requireWebAuthn();
  const credential = await navigator.credentials.get({
    publicKey: {
      allowCredentials: options.allowCredentials.map(toCredentialDescriptor),
      challenge: decodeBase64Url(options.challenge),
      rpId: options.rpId,
      timeout: options.timeout,
      userVerification: options.userVerification,
    },
  });
  if (!(credential instanceof PublicKeyCredential)) {
    throw new DOMException(
      "Security-key verification did not return a credential",
      "NotAllowedError",
    );
  }
  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    id: credential.id,
    rawId: encodeBase64Url(credential.rawId),
    type: "public-key",
    response: {
      authenticatorData: encodeBase64Url(response.authenticatorData),
      clientDataJSON: encodeBase64Url(response.clientDataJSON),
      signature: encodeBase64Url(response.signature),
      userHandle: response.userHandle ? encodeBase64Url(response.userHandle) : null,
    },
  };
}
