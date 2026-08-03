import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useAui } from "@assistant-ui/react";
import { BlocksIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { WORKSPACE_SKILLS_QUERY_KEY, listWorkspaceSkillGrantOptions } from "@/api/workspace-skills";
import {
  skillInstallationIdsForComposerScope,
  useAIComposerDirectiveStore,
  type AIComposerDirectiveScope,
} from "@/components/ai/ai-composer-directives";
import { useAIComposerDirectiveInsertion } from "@/components/ai/ai-composer-rich-input";
import {
  AIComposerSkillPanelContent,
  type AIComposerSkillOption,
} from "@/components/ai/ai-composer-skill-panel";
import { requiredTranslation } from "@/lib/i18n/required-translation";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { cn } from "@arclayer/lib/utils";
import { Button } from "@arclayer/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@arclayer/ui/dropdown-menu";

export type { AIComposerSkillOption } from "@/components/ai/ai-composer-skill-panel";

export function useEnabledAIComposerSkills(options: { enabled?: boolean } = {}) {
  const { i18n } = useTranslation(["ai", "settings"]);
  const workspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
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
              ? requiredTranslation(
                  i18n,
                  `settings:${officialPackage.displayNameKey}`,
                  "official Skill name",
                )
              : installation.packageId),
          description:
            workspacePackage?.description ??
            (officialPackage
              ? requiredTranslation(
                  i18n,
                  `settings:${officialPackage.descriptionKey}`,
                  "official Skill description",
                )
              : installation.packageId),
        };
      });
  }, [i18n, query.data]);

  return { ...query, skills, workspaceId };
}

export function AIComposerSkillMenu(props: {
  compact?: boolean;
  scope?: AIComposerDirectiveScope;
}) {
  const { t } = useTranslation("ai");
  const aui = useAui();
  const { insertDirective } = useAIComposerDirectiveInsertion();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { isError, isLoading, skills, workspaceId } = useEnabledAIComposerSkills({ enabled: open });

  const selectSkill = (skill: AIComposerSkillOption) => {
    const scope = props.scope ?? "thread";
    useAIComposerDirectiveStore.getState().addDirectives(scope, [
      {
        type: "skill",
        id: skill.id,
        label: skill.label,
      },
    ]);
    insertDirective({
      type: "skill",
      id: skill.id,
      label: skill.label,
    });
    const composer = aui.composer();
    const current = composer.getState().runConfig;
    composer.setRunConfig({
      ...current,
      custom: {
        ...current.custom,
        selectedSkillInstallationIds: [...skillInstallationIdsForComposerScope(scope)],
      },
    });
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
      <DropdownMenuContent
        align="start"
        collisionPadding={16}
        className="w-[min(25rem,calc(100vw-2rem))] p-1.5"
      >
        <AIComposerSkillPanelContent
          presentation="dropdown"
          skills={skills}
          isLoading={isLoading}
          isError={isError}
          onSelectSkill={selectSkill}
          onManage={() => {
            setOpen(false);
            void navigate({ to: "/customization/skills" });
          }}
          onCreate={createSkillWithArclayer}
          onImport={() => {
            setOpen(false);
            void navigate({ to: "/customization/skills", search: { action: "import" } });
          }}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
