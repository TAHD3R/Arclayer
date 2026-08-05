import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { BlocksIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { WORKSPACE_SKILLS_QUERY_KEY, listWorkspaceSkillGrantOptions } from "@/api/workspace-skills";
import { AI_COMPOSER_SKILL_CREATOR_COMMAND } from "@/components/ai/ai-composer-directives";
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

export function useEnabledAIComposerSkills(
  options: { enabled?: boolean; workspaceId?: string | null } = {},
) {
  const { i18n } = useTranslation(["ai", "settings"]);
  const currentWorkspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
  const workspaceId = options.workspaceId ?? currentWorkspaceId;
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
        const slug = workspacePackage?.slug ?? officialPackage?.slug ?? installation.packageId;
        return {
          id: installation.id,
          slug,
          label:
            workspacePackage?.displayName ??
            (officialPackage
              ? officialPackage.displayNameKey
                ? requiredTranslation(
                    i18n,
                    `settings:${officialPackage.displayNameKey}`,
                    "official Skill name",
                  )
                : officialPackage.displayName
              : installation.packageId),
          description:
            workspacePackage?.description ??
            (officialPackage
              ? officialPackage.descriptionKey
                ? requiredTranslation(
                    i18n,
                    `settings:${officialPackage.descriptionKey}`,
                    "official Skill description",
                  )
                : officialPackage.description
              : installation.packageId),
          ...(slug === AI_COMPOSER_SKILL_CREATOR_COMMAND ? { command: slug } : {}),
        };
      });
  }, [i18n, query.data]);

  return { ...query, skills, workspaceId };
}

export function AIComposerSkillMenu(props: { compact?: boolean; iconOnly?: boolean }) {
  const { t } = useTranslation("ai");
  const { insertDirective } = useAIComposerDirectiveInsertion();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { isError, isLoading, skills, workspaceId } = useEnabledAIComposerSkills({ enabled: open });
  const skillCreator = skills.find((skill) => skill.command === AI_COMPOSER_SKILL_CREATOR_COMMAND);

  const selectSkill = (skill: AIComposerSkillOption) => {
    insertDirective({
      type: "skill",
      id: skill.id,
      label: skill.label,
      description: skill.description,
      ...(skill.command ? { metadata: { command: skill.command } } : {}),
    });
    setOpen(false);
  };

  const createSkillWithArclayer = () => {
    if (!skillCreator) throw new Error("AI_COMPOSER_SKILL_CREATOR_UNAVAILABLE");
    selectSkill(skillCreator);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size={props.iconOnly ? "icon-sm" : "sm"}
          aria-label={t("AI_CHAT_SKILL_SELECT")}
          aria-expanded={open}
          disabled={!workspaceId}
          title={props.iconOnly ? t("AI_CHAT_SKILL_LABEL") : undefined}
          className={cn(
            "h-8 min-w-0 justify-start gap-2 rounded-md px-2.5 text-footnote font-semibold text-label-primary shadow-none hover:bg-accent/70",
            props.iconOnly
              ? "w-8 justify-center gap-0 px-0"
              : props.compact
                ? "max-w-[8rem]"
                : "max-w-[11rem]",
          )}
        >
          <BlocksIcon className="size-3.5 shrink-0 text-label-secondary" aria-hidden="true" />
          {props.iconOnly ? null : <span className="truncate">{t("AI_CHAT_SKILL_LABEL")}</span>}
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
          buildWithArclayerDisabled={!skillCreator}
          onSelectSkill={selectSkill}
          onManage={() => {
            setOpen(false);
            void navigate({ to: "/customization/skills" });
          }}
          onBuildWithArclayer={createSkillWithArclayer}
          onWriteManually={() => {
            setOpen(false);
            void navigate({ to: "/customization/skills", search: { action: "manual" } });
          }}
          onImportGitHub={() => {
            setOpen(false);
            void navigate({ to: "/customization/skills", search: { action: "github" } });
          }}
          onUploadZip={() => {
            setOpen(false);
            void navigate({ to: "/customization/skills", search: { action: "zip" } });
          }}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
