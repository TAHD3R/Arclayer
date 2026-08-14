import { create } from "zustand";

export interface PendingPlanConfirmation {
  readonly threadId: string;
  readonly planRunId: string;
}

export interface PendingThreadContinuation {
  readonly projectId: string;
  readonly remoteThreadId: string;
}

interface ApprovedProjectBootstrap extends PendingPlanConfirmation {
  readonly buildRunId: string | null;
}

interface AIRunTransitionState {
  readonly pendingPlanConfirmation: PendingPlanConfirmation | null;
  readonly approvedProjectBootstrap: ApprovedProjectBootstrap | null;
  readonly pendingThreadContinuation: PendingThreadContinuation | null;
  setPendingPlanConfirmation: (value: PendingPlanConfirmation) => void;
  clearPendingPlanConfirmation: (planRunId: string) => void;
  approveProjectBootstrap: (value: PendingPlanConfirmation) => void;
  bindApprovedProjectBootstrapRun: (planRunId: string, buildRunId: string) => void;
  consumeApprovedProjectBootstrap: (buildRunId: string) => void;
  clearApprovedProjectBootstrap: (planRunId: string) => void;
  setPendingThreadContinuation: (value: PendingThreadContinuation) => void;
  consumePendingThreadContinuation: (projectId: string, remoteThreadId: string) => void;
}

export const useAIRunTransitionStore = create<AIRunTransitionState>((set) => ({
  pendingPlanConfirmation: null,
  approvedProjectBootstrap: null,
  pendingThreadContinuation: null,
  setPendingPlanConfirmation: (value) => set({ pendingPlanConfirmation: value }),
  clearPendingPlanConfirmation: (planRunId) =>
    set((state) =>
      state.pendingPlanConfirmation?.planRunId === planRunId
        ? { pendingPlanConfirmation: null }
        : state,
    ),
  approveProjectBootstrap: (value) =>
    set({
      pendingPlanConfirmation: null,
      approvedProjectBootstrap: { ...value, buildRunId: null },
    }),
  bindApprovedProjectBootstrapRun: (planRunId, buildRunId) =>
    set((state) =>
      state.approvedProjectBootstrap?.planRunId === planRunId
        ? {
            approvedProjectBootstrap: {
              ...state.approvedProjectBootstrap,
              buildRunId,
            },
          }
        : state,
    ),
  consumeApprovedProjectBootstrap: (buildRunId) =>
    set((state) =>
      state.approvedProjectBootstrap?.buildRunId === buildRunId
        ? { approvedProjectBootstrap: null }
        : state,
    ),
  clearApprovedProjectBootstrap: (planRunId) =>
    set((state) =>
      state.approvedProjectBootstrap?.planRunId === planRunId
        ? { approvedProjectBootstrap: null }
        : state,
    ),
  setPendingThreadContinuation: (value) => set({ pendingThreadContinuation: value }),
  consumePendingThreadContinuation: (projectId, remoteThreadId) =>
    set((state) =>
      state.pendingThreadContinuation?.projectId === projectId &&
      state.pendingThreadContinuation.remoteThreadId === remoteThreadId
        ? { pendingThreadContinuation: null }
        : state,
    ),
}));
