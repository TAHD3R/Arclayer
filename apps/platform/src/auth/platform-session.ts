import type {
  PlatformSessionIssuedOut,
  PlatformSessionPrincipal,
} from "@arclayer/platform-openapi";

export type StoredPlatformSession = Readonly<{
  accessToken: string;
  accessTokenExpiresAt: string;
  principal: PlatformSessionPrincipal;
}>;

export type PlatformSessionNotice = "expired" | "revoked";

const SESSION_STORAGE_KEY = "arclayer:platform:session";
const SESSION_NOTICE_KEY = "arclayer:platform:session-notice";
const SESSION_CHANGED_EVENT = "arclayer:platform-session-changed";

function isPrincipal(value: unknown): value is PlatformSessionPrincipal {
  if (!value || typeof value !== "object") return false;
  const principal = value as Partial<PlatformSessionPrincipal>;
  return (
    typeof principal.actorId === "string" &&
    typeof principal.sessionId === "string" &&
    typeof principal.absoluteExpiresAt === "string" &&
    typeof principal.policyRevision === "number" &&
    typeof principal.isInstanceOwner === "boolean"
  );
}

function isStoredSession(value: unknown): value is StoredPlatformSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<StoredPlatformSession>;
  return (
    typeof session.accessToken === "string" &&
    session.accessToken.length > 0 &&
    typeof session.accessTokenExpiresAt === "string" &&
    isPrincipal(session.principal)
  );
}

function notifySessionChanged(): void {
  window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
}

function parseDeadline(value: string): number {
  const deadline = Date.parse(value);
  if (!Number.isFinite(deadline)) throw new Error("Invalid Platform Session expiry");
  return deadline;
}

export function clearPlatformSession(notice?: PlatformSessionNotice): void {
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
  if (notice) window.sessionStorage.setItem(SESSION_NOTICE_KEY, notice);
  notifySessionChanged();
}

export function readPlatformSession(now = Date.now()): StoredPlatformSession | null {
  const serialized = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (!serialized) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    clearPlatformSession("revoked");
    return null;
  }
  if (!isStoredSession(parsed)) {
    clearPlatformSession("revoked");
    return null;
  }

  const effectiveDeadline = Math.min(
    parseDeadline(parsed.accessTokenExpiresAt),
    parseDeadline(parsed.principal.absoluteExpiresAt),
  );
  if (effectiveDeadline <= now) {
    clearPlatformSession("expired");
    return null;
  }
  return parsed;
}

export function savePlatformSession(
  issued: PlatformSessionIssuedOut,
  now = Date.now(),
): StoredPlatformSession {
  const { credential } = issued;
  if (issued.state !== "authenticated" || credential.expiresIn <= 0) {
    throw new Error("Platform API returned an invalid authenticated Session");
  }
  parseDeadline(credential.session.absoluteExpiresAt);
  const stored: StoredPlatformSession = {
    accessToken: credential.accessToken,
    accessTokenExpiresAt: new Date(now + credential.expiresIn * 1000).toISOString(),
    principal: credential.session,
  };
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(stored));
  window.sessionStorage.removeItem(SESSION_NOTICE_KEY);
  notifySessionChanged();
  return stored;
}

export function consumePlatformSessionNotice(): PlatformSessionNotice | null {
  const notice = window.sessionStorage.getItem(SESSION_NOTICE_KEY);
  window.sessionStorage.removeItem(SESSION_NOTICE_KEY);
  return notice === "expired" || notice === "revoked" ? notice : null;
}

export function subscribeToPlatformSession(listener: () => void): () => void {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === SESSION_STORAGE_KEY) listener();
  };
  window.addEventListener("storage", handleStorage);
  window.addEventListener(SESSION_CHANGED_EVENT, listener);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(SESSION_CHANGED_EVENT, listener);
  };
}

export function getPlatformAccessToken(): string | undefined {
  return readPlatformSession()?.accessToken;
}

export function getPlatformSessionDeadline(session: StoredPlatformSession): number {
  return Math.min(
    parseDeadline(session.accessTokenExpiresAt),
    parseDeadline(session.principal.absoluteExpiresAt),
  );
}
