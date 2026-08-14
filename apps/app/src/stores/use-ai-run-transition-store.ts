import { create } from "zustand";

export interface PendingThreadContinuation {
  readonly projectId: string;
  readonly remoteThreadId: string;
}

interface AIRunTransitionState {
  readonly pendingThreadContinuation: PendingThreadContinuation | null;
  setPendingThreadContinuation: (value: PendingThreadContinuation) => void;
  consumePendingThreadContinuation: (projectId: string, remoteThreadId: string) => void;
}

export const useAIRunTransitionStore = create<AIRunTransitionState>((set) => ({
  pendingThreadContinuation: null,
  setPendingThreadContinuation: (value) => set({ pendingThreadContinuation: value }),
  consumePendingThreadContinuation: (projectId, remoteThreadId) =>
    set((state) =>
      state.pendingThreadContinuation?.projectId === projectId &&
      state.pendingThreadContinuation.remoteThreadId === remoteThreadId
        ? { pendingThreadContinuation: null }
        : state,
    ),
}));
