import { create } from "zustand";

export type AIComposerDirectiveScope = "thread" | "home";
export type AIComposerDirectiveType =
  | "project"
  | "agent"
  | "skill"
  | "attachment"
  | "asset"
  | "content"
  | "action";

export interface AIComposerDirectiveChip {
  type: AIComposerDirectiveType;
  id: string;
  label: string;
  previewUrl?: string;
  mime?: string;
}

type AIComposerDirectiveState = {
  directivesByScope: Record<AIComposerDirectiveScope, AIComposerDirectiveChip[]>;
  addDirectives: (scope: AIComposerDirectiveScope, directives: AIComposerDirectiveChip[]) => void;
  setDirectives: (scope: AIComposerDirectiveScope, directives: AIComposerDirectiveChip[]) => void;
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
  setDirectives: (scope, directives) =>
    set((state) => {
      if (equalDirectives(state.directivesByScope[scope], directives)) return state;
      return {
        directivesByScope: {
          ...state.directivesByScope,
          [scope]: directives,
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

export function filterTrustedAIComposerDirectives(
  parsed: readonly AIComposerDirectiveChip[],
  registered: readonly AIComposerDirectiveChip[],
): AIComposerDirectiveChip[] {
  const trustedDirectiveKeys = new Set<string>();
  for (const directive of registered) {
    if (directive.type === "agent" || directive.type === "skill") {
      trustedDirectiveKeys.add(`${directive.type}:${directive.id}`);
    }
  }
  return parsed.filter(
    (directive) =>
      (directive.type !== "agent" && directive.type !== "skill") ||
      trustedDirectiveKeys.has(`${directive.type}:${directive.id}`),
  );
}

export function cleanAIComposerDirectiveText(text: string): string {
  return text
    .replace(DIRECTIVE_PATTERN, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
}

export function removeAIComposerDirectiveByIdentity(
  text: string,
  type: string,
  id: string,
): string {
  return text.replace(DIRECTIVE_PATTERN, (match, rawType: string, label: string, rawId: string) => {
    const normalizedId = rawId?.trim() || label.trim();
    return rawType === type && normalizedId === id ? "" : match;
  });
}

export function clearAIComposerDirectives(scope: AIComposerDirectiveScope): void {
  useAIComposerDirectiveStore.getState().clearDirectives(scope);
}

export function consumeAIComposerDirectives(
  scope: AIComposerDirectiveScope,
  mentionedAgentIds: readonly string[],
  selectedSkillInstallationIds: readonly string[],
): void {
  const consumedAgentIds = new Set(mentionedAgentIds);
  const consumedSkillInstallationIds = new Set(selectedSkillInstallationIds);
  useAIComposerDirectiveStore.setState((state) => ({
    directivesByScope: {
      ...state.directivesByScope,
      [scope]: state.directivesByScope[scope].filter(
        (directive) =>
          (directive.type === "agent" && !consumedAgentIds.has(directive.id)) ||
          (directive.type === "skill" && !consumedSkillInstallationIds.has(directive.id)),
      ),
    },
  }));
}

export function agentIdsForComposerScope(scope: AIComposerDirectiveScope): readonly string[] {
  const agentIds: string[] = [];
  for (const directive of useAIComposerDirectiveStore.getState().directivesByScope[scope]) {
    if (directive.type === "agent") agentIds.push(directive.id);
  }
  return agentIds;
}

export function skillInstallationIdsForComposerScope(
  scope: AIComposerDirectiveScope,
): readonly string[] {
  const installationIds: string[] = [];
  for (const directive of useAIComposerDirectiveStore.getState().directivesByScope[scope]) {
    if (directive.type === "skill") installationIds.push(directive.id);
  }
  return installationIds;
}

function normalizeDirectiveType(value: string | undefined): AIComposerDirectiveType | null {
  if (
    value === "project" ||
    value === "agent" ||
    value === "skill" ||
    value === "attachment" ||
    value === "asset" ||
    value === "content" ||
    value === "action"
  ) {
    return value;
  }
  return null;
}

function equalDirectives(
  current: readonly AIComposerDirectiveChip[],
  next: readonly AIComposerDirectiveChip[],
): boolean {
  return (
    current.length === next.length &&
    current.every((directive, index) => {
      const candidate = next[index];
      return (
        candidate?.type === directive.type &&
        candidate.id === directive.id &&
        candidate.label === directive.label &&
        candidate.previewUrl === directive.previewUrl &&
        candidate.mime === directive.mime
      );
    })
  );
}
