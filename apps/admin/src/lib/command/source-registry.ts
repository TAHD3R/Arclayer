import type { CommandSection, CommandSectionId } from "@/lib/command/command-types";

export type CommandSourceMode = "browse" | "search" | "both";

export type CommandSourceContext = {
  query: string;
  isSearching: boolean;
};

export type CommandSource = {
  id: CommandSectionId;
  mode: CommandSourceMode;
  resolve: (context: CommandSourceContext) => CommandSection | null;
};

function matchesMode(mode: CommandSourceMode, isSearching: boolean): boolean {
  if (mode === "both") return true;
  return isSearching ? mode === "search" : mode === "browse";
}

export function resolveCommandSections(
  sources: readonly CommandSource[],
  context: CommandSourceContext,
): CommandSection[] {
  return sources
    .filter((source) => matchesMode(source.mode, context.isSearching))
    .map((source) => source.resolve(context))
    .filter((section): section is CommandSection => {
      if (!section) return false;
      if (section.loading) return true;
      return section.entries.length > 0;
    });
}
