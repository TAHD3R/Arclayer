import { useQuery } from "@tanstack/react-query";
import { useAui } from "@assistant-ui/react";
import { BlocksIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { WORKSPACE_SKILLS_QUERY_KEY, listWorkspaceSkillGrantOptions } from "@/api/workspace-skills";
import {
  useAIComposerDirectiveStore,
  type AIComposerDirectiveScope,
} from "@/components/ai/ai-composer-directives";
import {
  AIComposerSkillPanelContent,
  type AIComposerSkillOption,
} from "@/components/ai/ai-composer-skill-panel";
import { useSettingsScreen } from "@/components/layout/settings-screen-provider";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { cn } from "@arclayer/lib/utils";
import { Button } from "@arclayer/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@arclayer/ui/dropdown-menu";

export type { AIComposerSkillOption } from "@/components/ai/ai-composer-skill-panel";

export function useEnabledAIComposerSkills(options: { enabled?: boolean } = {}) {
  const { t } = useTranslation(["ai", "settings"]);
  const workspaceId = useWorkspaceStore(
    (state) => state.currentWorkspaceId ?? state.lastWorkspaceId,
  );
  const query = useQuery({
    queryKey: [...WORKSPACE_SKILLS_QUERY_KEY, "composer", workspaceId],
    enabled: Boolean(workspaceId && (options.enabled ?? true)),
    queryFn: ({ signal }) => listWorkspaceSkillGrantOptions(String(workspaceId), signal),
    staleTime: 30_000,
    retry: false,
    meta: { silent: true },
  });
  const skills = useMemo<AIComposerSkillOption[]>(() => {
    if (!query.data) return [];
    const workspacePackages = new Map(
      query.data.workspacePackages.map((item) => [item.id, item] as const),
    );
    const officialPackages = new Map(
      query.data.officialPackages.map((item) => [item.packageId, item] as const),
    );
    return query.data.installations
      .filter((installation) => installation.status === "enabled")
      .map((installation) => {
        const workspacePackage = workspacePackages.get(installation.packageId);
        const officialPackage = officialPackages.get(installation.packageId);
        return {
          id: installation.id,
          slug: workspacePackage?.slug ?? officialPackage?.slug ?? installation.packageId,
          label:
            workspacePackage?.displayName ??
            (officialPackage
              ? t(officialPackage.displayNameKey, { defaultValue: officialPackage.displayName })
              : installation.packageId),
          description:
            workspacePackage?.description ??
            (officialPackage
              ? t(officialPackage.descriptionKey, { defaultValue: officialPackage.description })
              : installation.packageId),
        };
      });
  }, [query.data, t]);

  return { ...query, skills, workspaceId };
}

export function AIComposerSkillMenu(props: {
  compact?: boolean;
  scope?: AIComposerDirectiveScope;
}) {
  const { t } = useTranslation("ai");
  const aui = useAui();
  const settingsScreen = useSettingsScreen();
  const [open, setOpen] = useState(false);
  const { isError, isLoading, skills, workspaceId } = useEnabledAIComposerSkills({ enabled: open });

  const selectSkill = (skill: AIComposerSkillOption) => {
    const skillPrompt = t("AI_CHAT_SKILL_PROMPT", { skill: skill.label });
    useAIComposerDirectiveStore.getState().addDirectives(props.scope ?? "thread", [
      {
        type: "skill",
        id: skill.id,
        label: skill.label,
        instruction: skillPrompt,
      },
    ]);
    setOpen(false);
  };

  const createSkillWithArclayer = () => {
    aui.composer().setText("/skill-creator ");
    setOpen(false);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={t("AI_CHAT_SKILL_SELECT")}
          aria-expanded={open}
          disabled={!workspaceId}
          className={cn(
            "h-8 min-w-0 justify-start gap-2 rounded-md px-2.5 text-footnote font-semibold text-label-primary shadow-none hover:bg-accent/70",
            props.compact ? "max-w-[8rem]" : "max-w-[11rem]",
          )}
        >
          <BlocksIcon className="size-3.5 shrink-0 text-label-secondary" aria-hidden="true" />
          <span className="truncate">{t("AI_CHAT_SKILL_LABEL")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[min(25rem,calc(100vw-2rem))] p-1.5">
        <AIComposerSkillPanelContent
          presentation="dropdown"
          skills={skills}
          isLoading={isLoading}
          isError={isError}
          onSelectSkill={selectSkill}
          onManage={() => {
            setOpen(false);
            settingsScreen.openSettings({ screen: "workspace.skills" });
          }}
          onCreate={createSkillWithArclayer}
          onImport={() => {
            setOpen(false);
            settingsScreen.openSettings({
              screen: "workspace.skills",
              payload: { skillAction: "import" },
            });
          }}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
