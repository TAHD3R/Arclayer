import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { STORAGE_KEYS } from "@/constants/storage";

const AUTH_CHALLENGE_STORE_VERSION = 1;

export type AuthChallengeSource = "password" | "email-code" | "sso";

export type AuthChallengeSnapshot = {
  twoFactorToken: string;
  expiresAt: number;
  keepSession: boolean;
  redirect: string | null;
  source: AuthChallengeSource;
  methods?: string[];
};

type AuthChallengeState = {
  twoFactorToken: string | null;
  expiresAt: number | null;
  keepSession: boolean;
  redirect: string | null;
  source: AuthChallengeSource | null;
  methods: string[];
  setChallenge: (challenge: AuthChallengeSnapshot) => void;
  clear: () => void;
};

function createEmptyChallengeState() {
  return {
    twoFactorToken: null,
    expiresAt: null,
    keepSession: true,
    redirect: null,
    source: null,
    methods: [],
  } satisfies Omit<AuthChallengeState, "setChallenge" | "clear">;
}

export function isAuthChallengeExpired(expiresAt: number | null, now = Date.now()): boolean {
  if (typeof expiresAt !== "number") return true;
  return expiresAt <= now;
}

export function getActiveAuthChallenge(
  state: Pick<
    AuthChallengeState,
    "twoFactorToken" | "expiresAt" | "keepSession" | "redirect" | "source" | "methods"
  >,
): AuthChallengeSnapshot | null {
  const { twoFactorToken, expiresAt, keepSession, redirect, source, methods } = state;
  if (!twoFactorToken || !source || expiresAt === null || isAuthChallengeExpired(expiresAt)) {
    return null;
  }

  return {
    twoFactorToken,
    expiresAt,
    keepSession,
    redirect,
    source,
    methods: methods ?? [],
  };
}

export const useAuthChallengeStore = create<AuthChallengeState>()(
  persist(
    (set) => ({
      ...createEmptyChallengeState(),
      setChallenge: (challenge) => set({ ...challenge }),
      clear: () => set(createEmptyChallengeState()),
    }),
    {
      name: STORAGE_KEYS.authChallenge,
      storage: createJSONStorage(() => sessionStorage),
      version: AUTH_CHALLENGE_STORE_VERSION,
      partialize: (state) => ({
        twoFactorToken: state.twoFactorToken,
        expiresAt: state.expiresAt,
        keepSession: state.keepSession,
        redirect: state.redirect,
        source: state.source,
        methods: state.methods,
      }),
    },
  ),
);

export async function rehydrateAuthChallengeStore(): Promise<void> {
  await useAuthChallengeStore.persist.rehydrate();
}
