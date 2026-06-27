import { create } from "zustand";

export type AIComposerDirectiveScope = "thread" | "home";
export type AIComposerDirectiveType = "project" | "action";

export interface AIComposerDirectiveChip {
  type: AIComposerDirectiveType;
  id: string;
  label: string;
}

type AIComposerDirectiveState = {
  directivesByScope: Record<AIComposerDirectiveScope, AIComposerDirectiveChip[]>;
  addDirectives: (scope: AIComposerDirectiveScope, directives: AIComposerDirectiveChip[]) => void;
  removeDirective: (scope: AIComposerDirectiveScope, directive: AIComposerDirectiveChip) => void;
  clearDirectives: (scope: AIComposerDirectiveScope) => void;
};

const EMPTY_DIRECTIVES_BY_SCOPE: Record<AIComposerDirectiveScope, AIComposerDirectiveChip[]> = {
  thread: [],
  home: [],
};

const DIRECTIVE_PATTERN =
  /:([a-zA-Z][\w-]{0,63})\[([^\]\n]{1,1024})\]\s*(?:\{name=([^}\n]{1,1024})\})?/gu;

export const useAIComposerDirectiveStore = create<AIComposerDirectiveState>()((set) => ({
  directivesByScope: EMPTY_DIRECTIVES_BY_SCOPE,
  addDirectives: (scope, directives) =>
    set((state) => {
      if (directives.length === 0) return state;
      const merged = [...state.directivesByScope[scope]];
      for (const directive of directives) {
        const exists = merged.some(
          (item) => item.type === directive.type && item.id === directive.id,
        );
        if (!exists) merged.push(directive);
      }
      return {
        directivesByScope: {
          ...state.directivesByScope,
          [scope]: merged,
        },
      };
    }),
  removeDirective: (scope, directive) =>
    set((state) => ({
      directivesByScope: {
        ...state.directivesByScope,
        [scope]: state.directivesByScope[scope].filter(
          (item) => !(item.type === directive.type && item.id === directive.id),
        ),
      },
    })),
  clearDirectives: (scope) =>
    set((state) => ({
      directivesByScope: {
        ...state.directivesByScope,
        [scope]: [],
      },
    })),
}));

export function parseAIComposerDirectives(text: string): AIComposerDirectiveChip[] {
  return [...text.matchAll(DIRECTIVE_PATTERN)]
    .map((match): AIComposerDirectiveChip | null => {
      const type = normalizeDirectiveType(match[1]);
      const label = match[2]?.trim();
      const id = match[3]?.trim() || label;
      if (!type || !label || !id) return null;
      return { type, id, label };
    })
    .filter((directive): directive is AIComposerDirectiveChip => directive !== null);
}

export function cleanAIComposerDirectiveText(text: string): string {
  return text
    .replace(DIRECTIVE_PATTERN, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
}

export function serializeAIComposerDirective(directive: AIComposerDirectiveChip): string {
  return `:${directive.type}[${directive.label}]{name=${directive.id}}`;
}

export function buildTextWithAIComposerDirectives(
  scope: AIComposerDirectiveScope,
  text: string,
): string {
  const state = useAIComposerDirectiveStore.getState();
  const directives = state.directivesByScope[scope];
  if (directives.length === 0) return text;
  return [directives.map(serializeAIComposerDirective).join(" "), text].filter(Boolean).join(" ");
}

export function clearAIComposerDirectives(scope: AIComposerDirectiveScope): void {
  useAIComposerDirectiveStore.getState().clearDirectives(scope);
}

function normalizeDirectiveType(value: string | undefined): AIComposerDirectiveType | null {
  if (value === "project" || value === "action") return value;
  return null;
}
