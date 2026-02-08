export function formatInvitationExpiresRelative(opts: {
  t: (k: string, params?: Record<string, unknown>) => string;
  locale: string;
  expiresAt: string | null | undefined;
}): string {
  const expiresAt = (opts.expiresAt || "").trim();
  if (!expiresAt) return opts.t("invite:INVITE_EXPIRES_RELATIVE_NEVER");

  const expires = new Date(expiresAt);
  if (Number.isNaN(expires.getTime())) return opts.t("invite:INVITE_EXPIRES_RELATIVE_UNKNOWN");

  const now = Date.now();
  const diffMs = expires.getTime() - now;
  const absMs = Math.abs(diffMs);

  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  let unit: Intl.RelativeTimeFormatUnit = "day";
  let value = 0;

  if (absMs < hour) {
    unit = "minute";
    value = Math.round(diffMs / minute);
  } else if (absMs < day) {
    unit = "hour";
    value = Math.round(diffMs / hour);
  } else {
    unit = "day";
    value = Math.round(diffMs / day);
  }

  if (value === 0) value = diffMs >= 0 ? 1 : -1;

  const rtf = new Intl.RelativeTimeFormat(opts.locale, { numeric: "auto" });
  const relative = rtf.format(value, unit);

  return diffMs >= 0
    ? opts.t("invite:INVITE_EXPIRES_RELATIVE_FUTURE", { relative })
    : opts.t("invite:INVITE_EXPIRES_RELATIVE_PAST", { relative });
}

export function resolveRoleText(
  t: (k: string, opts?: Record<string, unknown>) => string,
  roleCode: string | null | undefined,
  backendFallback: { name?: string | null; description?: string | null },
): { name: string; description: string | null } {
  const code = (roleCode || "").trim().toLowerCase();
  const known =
    code === "owner" ||
    code === "admin" ||
    code === "architect" ||
    code === "editor" ||
    code === "viewer";
  if (known) {
    const nameKey = `invite:ROLE_${code.toUpperCase()}_NAME`;
    const descKey = `invite:ROLE_${code.toUpperCase()}_DESC`;
    const name = t(nameKey);
    const desc = t(descKey);
    return {
      name: name && name !== nameKey ? name : backendFallback.name || code,
      description: desc && desc !== descKey ? desc : backendFallback.description || null,
    };
  }
  return {
    name: backendFallback.name || code || t("invite:INVITE_ROLE_UNKNOWN"),
    description: backendFallback.description || null,
  };
}

export function briefRoleDescription(description: string | null | undefined): string | null {
  const raw = String(description || "").trim();
  if (!raw) return null;
  const parts = raw.split(/[.\u3002;；]/).map((segment) => segment.trim());
  const first = parts.find((segment) => segment) || raw;
  return first || null;
}
