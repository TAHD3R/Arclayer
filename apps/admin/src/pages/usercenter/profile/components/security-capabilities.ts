export function resolveSetPasswordReauthMethods(data: unknown): string[] {
  if (!data || typeof data !== "object") return [];
  const methods =
    (data as { setPasswordRequiredReauthMethods?: string[] }).setPasswordRequiredReauthMethods ??
    (data as { set_password_required_reauth_methods?: string[] })
      .set_password_required_reauth_methods;
  return Array.isArray(methods) ? methods : [];
}

export function resolveHasPassword(data: unknown): boolean {
  if (!data || typeof data !== "object") return true;
  const camel = (data as { hasPassword?: boolean }).hasPassword;
  if (typeof camel === "boolean") return camel;
  const snake = (data as { has_password?: boolean }).has_password;
  if (typeof snake === "boolean") return snake;
  return true;
}

export function resolveHasLinkedOauthIdentities(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const camel = (data as { hasLinkedOauthIdentities?: boolean }).hasLinkedOauthIdentities;
  if (typeof camel === "boolean") return camel;
  const snake = (data as { has_linked_oauth_identities?: boolean }).has_linked_oauth_identities;
  if (typeof snake === "boolean") return snake;
  return false;
}
