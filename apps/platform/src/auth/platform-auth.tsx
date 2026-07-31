import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import {
  clearPlatformSession,
  getPlatformSessionDeadline,
  readPlatformSession,
  savePlatformSession,
  subscribeToPlatformSession,
  type StoredPlatformSession,
} from "@/auth/platform-session";
import type { PlatformSessionIssuedOut } from "@arclayer/platform-openapi";

type PlatformAuthContextValue = Readonly<{
  session: StoredPlatformSession | null;
  establishSession: (issued: PlatformSessionIssuedOut) => void;
  signOut: () => void;
}>;

const PlatformAuthContext = createContext<PlatformAuthContextValue | null>(null);

export function PlatformAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StoredPlatformSession | null>(() => readPlatformSession());

  useEffect(() => subscribeToPlatformSession(() => setSession(readPlatformSession())), []);

  useEffect(() => {
    if (!session) return;
    const remaining = getPlatformSessionDeadline(session) - Date.now();
    if (remaining <= 0) {
      clearPlatformSession("expired");
      return;
    }
    const timeout = window.setTimeout(() => clearPlatformSession("expired"), remaining);
    return () => window.clearTimeout(timeout);
  }, [session]);

  const value = useMemo<PlatformAuthContextValue>(
    () => ({
      session,
      establishSession: (issued) => setSession(savePlatformSession(issued)),
      signOut: () => clearPlatformSession(),
    }),
    [session],
  );

  return <PlatformAuthContext.Provider value={value}>{children}</PlatformAuthContext.Provider>;
}

export function usePlatformAuth(): PlatformAuthContextValue {
  const value = useContext(PlatformAuthContext);
  if (!value) throw new Error("usePlatformAuth must be used within PlatformAuthProvider");
  return value;
}
