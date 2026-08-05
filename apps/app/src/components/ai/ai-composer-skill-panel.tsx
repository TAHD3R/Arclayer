import { ComposerPrimitive, type Unstable_TriggerItem } from "@assistant-ui/react";
import {
  ArrowLeftIcon,
  BlocksIcon,
  FilePenLineIcon,
  GithubIcon,
  PlusIcon,
  Settings2Icon,
  UploadIcon,
  WandSparklesIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { AIComposerTriggerScrollArea } from "@/components/ai/ai-composer-trigger-scroll-area";
import { Button } from "@arclayer/ui/button";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@arclayer/ui/dropdown-menu";

export type AIComposerSkillOption = Readonly<{
  id: string;
  slug: string;
  label: string;
  description: string;
  command?: string;
}>;

type AIComposerSkillPanelContentProps = Readonly<{
  presentation: "dropdown" | "trigger";
  skills: readonly AIComposerSkillOption[];
  isLoading: boolean;
  isError?: boolean;
  onSelectSkill?: (skill: AIComposerSkillOption) => void;
  onManage: () => void;
  onBuildWithArclayer: () => void;
  buildWithArclayerDisabled?: boolean;
  onWriteManually: () => void;
  onImportGitHub: () => void;
  onUploadZip: () => void;
}>;

export function AIComposerSkillPanelContent(props: AIComposerSkillPanelContentProps) {
  const { t } = useTranslation("ai");
  const [showAddMenu, setShowAddMenu] = useState(false);

  if (showAddMenu) {
    return (
      <SkillPanelScrollRegion presentation={props.presentation}>
        <button
          type="button"
          className="flex min-h-9 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-footnote font-semibold text-label-secondary hover:bg-muted hover:text-label-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          onClick={() => setShowAddMenu(false)}
        >
          <ArrowLeftIcon className="size-4" aria-hidden="true" />
          {t("AI_CHAT_MENTION_BACK")}
        </button>
        <SkillAddAction
          icon={WandSparklesIcon}
          label={t("AI_CHAT_SKILL_CREATE_WITH_ARCLAYER")}
          description={t("AI_CHAT_SKILL_CREATE_WITH_ARCLAYER_DESC")}
          disabled={props.buildWithArclayerDisabled}
          onClick={props.onBuildWithArclayer}
        />
        <SkillAddAction
          icon={FilePenLineIcon}
          label={t("AI_CHAT_SKILL_WRITE_MANUALLY")}
          description={t("AI_CHAT_SKILL_WRITE_MANUALLY_DESC")}
          onClick={props.onWriteManually}
        />
        <SkillAddAction
          icon={GithubIcon}
          label={t("AI_CHAT_SKILL_IMPORT_GITHUB")}
          description={t("AI_CHAT_SKILL_IMPORT_GITHUB_DESC")}
          onClick={props.onImportGitHub}
        />
        <SkillAddAction
          icon={UploadIcon}
          label={t("AI_CHAT_SKILL_UPLOAD_ZIP")}
          description={t("AI_CHAT_SKILL_UPLOAD_ZIP_DESC")}
          onClick={props.onUploadZip}
        />
      </SkillPanelScrollRegion>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/60 px-2 py-1.5">
        <span className="text-footnote font-semibold text-label-secondary">
          {t("AI_CHAT_SKILL_ENABLED_TITLE")}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-footnote"
          onClick={props.onManage}
        >
          <Settings2Icon className="size-3.5" aria-hidden="true" />
          {t("AI_CHAT_SKILL_MANAGE")}
        </Button>
      </div>
      <SkillPanelScrollRegion presentation={props.presentation}>
        {props.presentation === "trigger" ? (
          <ComposerPrimitive.Unstable_TriggerPopoverItems>
            {(items) =>
              items.length > 0
                ? items.map((item, index) => (
                    <ComposerPrimitive.Unstable_TriggerPopoverItem
                      key={item.id}
                      item={item}
                      index={index}
                      className={skillItemClassName}
                    >
                      <SkillRow item={item} />
                    </ComposerPrimitive.Unstable_TriggerPopoverItem>
                  ))
                : !props.isLoading &&
                  !props.isError && (
                    <div className="px-3 py-6 text-center text-footnote text-label-secondary">
                      {t("AI_CHAT_SKILL_EMPTY")}
                    </div>
                  )
            }
          </ComposerPrimitive.Unstable_TriggerPopoverItems>
        ) : (
          props.skills.map((skill) => (
            <DropdownMenuItem
              key={skill.id}
              className="cursor-pointer items-start gap-3 px-3 py-2.5"
              onSelect={() => props.onSelectSkill?.(skill)}
            >
              <SkillRow item={skill} />
            </DropdownMenuItem>
          ))
        )}
        <SkillPanelState
          isLoading={props.isLoading}
          isError={Boolean(props.isError)}
          isEmpty={props.presentation === "dropdown" && props.skills.length === 0}
        />
      </SkillPanelScrollRegion>
      <SkillPanelFooter {...props} onShowAddMenu={() => setShowAddMenu(true)} />
    </div>
  );
}

function SkillPanelScrollRegion(props: {
  presentation: AIComposerSkillPanelContentProps["presentation"];
  children: ReactNode;
}) {
  if (props.presentation === "trigger") {
    return (
      <AIComposerTriggerScrollArea>
        <div className="py-1">{props.children}</div>
      </AIComposerTriggerScrollArea>
    );
  }
  return <div className="min-h-0 flex-1 overflow-y-auto py-1">{props.children}</div>;
}

function SkillPanelFooter(
  props: AIComposerSkillPanelContentProps & Readonly<{ onShowAddMenu: () => void }>,
) {
  const { t } = useTranslation("ai");
  if (props.presentation === "dropdown") {
    return (
      <>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="min-h-10 font-semibold">
            <PlusIcon className="size-4" aria-hidden="true" />
            {t("AI_CHAT_SKILL_ADD")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-56">
            <DropdownMenuItem
              disabled={props.buildWithArclayerDisabled}
              onSelect={props.onBuildWithArclayer}
            >
              <WandSparklesIcon className="size-4" aria-hidden="true" />
              {t("AI_CHAT_SKILL_CREATE_WITH_ARCLAYER")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={props.onWriteManually}>
              <FilePenLineIcon className="size-4" aria-hidden="true" />
              {t("AI_CHAT_SKILL_WRITE_MANUALLY")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={props.onImportGitHub}>
              <GithubIcon className="size-4" aria-hidden="true" />
              {t("AI_CHAT_SKILL_IMPORT_GITHUB")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={props.onUploadZip}>
              <UploadIcon className="size-4" aria-hidden="true" />
              {t("AI_CHAT_SKILL_UPLOAD_ZIP")}
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </>
    );
  }
  return (
    <button
      type="button"
      className="flex min-h-10 w-full shrink-0 items-center gap-2 border-t border-border/60 px-3 py-2 text-left text-footnote font-semibold text-label-secondary transition-colors hover:bg-muted hover:text-label-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      onClick={props.onShowAddMenu}
    >
      <PlusIcon className="size-4" aria-hidden="true" />
      {t("AI_CHAT_SKILL_ADD")}
    </button>
  );
}

const skillItemClassName =
  "flex w-full min-w-0 items-start gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-muted data-[highlighted]:bg-muted";

function SkillRow(props: {
  item: Pick<AIComposerSkillOption, "label" | "description"> | Unstable_TriggerItem;
}) {
  return (
    <>
      <BlocksIcon className="mt-0.5 size-4 shrink-0 text-label-secondary" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-footnote font-semibold text-label-primary">
          {props.item.label}
        </span>
        {props.item.description ? (
          <span className="mt-0.5 block line-clamp-2 text-caption text-label-secondary">
            {props.item.description}
          </span>
        ) : null}
      </span>
    </>
  );
}

function SkillPanelState(props: { isLoading: boolean; isError: boolean; isEmpty: boolean }) {
  const { t } = useTranslation("ai");
  if (props.isLoading) {
    return (
      <div className="px-3 py-3 text-footnote text-label-secondary">
        {t("AI_CHAT_SKILL_LOADING")}
      </div>
    );
  }
  if (props.isError) {
    return (
      <div className="px-3 py-3 text-footnote text-destructive">
        {t("AI_CHAT_SKILL_LOAD_FAILED")}
      </div>
    );
  }
  if (props.isEmpty) {
    return (
      <div className="px-3 py-6 text-center text-footnote text-label-secondary">
        {t("AI_CHAT_SKILL_EMPTY")}
      </div>
    );
  }
  return null;
}

function SkillAddAction(props: {
  icon: typeof WandSparklesIcon;
  label: string;
  description: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  const Icon = props.icon;
  return (
    <button
      type="button"
      disabled={props.disabled}
      className="flex min-h-11 w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
      onClick={props.onClick}
    >
      <Icon className="mt-0.5 size-4 text-label-secondary" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-footnote font-semibold text-label-primary">{props.label}</span>
        <span className="mt-0.5 block text-caption text-label-secondary">{props.description}</span>
      </span>
    </button>
  );
}
