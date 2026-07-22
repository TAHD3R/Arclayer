import { create } from "zustand";

export interface AIPromptEntry {
  readonly id: string;
  readonly prompt: string;
  readonly mentionedAgentIds: readonly string[];
}

interface AIEntryState {
  readonly entries: readonly AIPromptEntry[];
  submit: (prompt: string, mentionedAgentIds?: readonly string[]) => void;
  consume: (id: string) => void;
}

export const useAIEntryStore = create<AIEntryState>((set) => ({
  entries: [],
  submit: (prompt, mentionedAgentIds = []) => {
    const normalized = prompt.trim();
    if (!normalized) throw new Error("AI prompt must not be empty");
    set((state) => ({
      entries: [
        ...state.entries,
        {
          id: globalThis.crypto.randomUUID(),
          prompt: normalized,
          mentionedAgentIds: [...new Set(mentionedAgentIds)],
        },
      ],
    }));
  },
  consume: (id) =>
    set((state) => {
      if (state.entries[0]?.id !== id) return state;
      return { entries: state.entries.slice(1) };
    }),
}));
