import type { MySecurityCapabilityOut } from "@arclayer/openapi";

export function resolveSetPasswordReauthMethods(
  data: MySecurityCapabilityOut | undefined,
): string[] {
  return data?.setPasswordRequiredReauthMethods ?? [];
}

export function resolveHasPassword(data: MySecurityCapabilityOut | undefined): boolean {
  return data?.hasPassword ?? true;
}

export function resolveHasLinkedOauthIdentities(
  data: MySecurityCapabilityOut | undefined,
): boolean {
  return data?.hasLinkedOauthIdentities ?? false;
}
