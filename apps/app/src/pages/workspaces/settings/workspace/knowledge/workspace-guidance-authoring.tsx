import { useState } from "react";
import { ChevronDown, FilePenLine, Send, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Alert, AlertDescription, AlertTitle } from "@arclayer/ui/alert";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@arclayer/ui/accordion";
import { Button } from "@arclayer/ui/button";
import { ButtonGroup, ButtonGroupSeparator } from "@arclayer/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { Textarea } from "@arclayer/ui/textarea";
import { MarkdownPlateEditor } from "@/components/editor/markdown-plate-editor";

import type { WorkspaceGuidanceController } from "./use-workspace-guidance-controller";
import { RevisionStatusBadge, WorkspaceKnowledgeHistoryDrawer } from "./workspace-guidance-history";

const FAQ_ITEMS = [
  {
    value: "business",
    questionKey: "EDITOR_FAQ_BUSINESS_QUESTION",
    answerKey: "EDITOR_FAQ_BUSINESS_ANSWER",
    animationClass: "[animation-delay:0ms]",
  },
  {
    value: "voice",
    questionKey: "EDITOR_FAQ_VOICE_QUESTION",
    answerKey: "EDITOR_FAQ_VOICE_ANSWER",
    animationClass: "[animation-delay:45ms]",
  },
  {
    value: "rules",
    questionKey: "EDITOR_FAQ_RULES_QUESTION",
    answerKey: "EDITOR_FAQ_RULES_ANSWER",
    animationClass: "[animation-delay:90ms]",
  },
  {
    value: "projects",
    questionKey: "EDITOR_FAQ_PROJECTS_QUESTION",
    answerKey: "EDITOR_FAQ_PROJECTS_ANSWER",
    animationClass: "[animation-delay:135ms]",
  },
  {
    value: "publish",
    questionKey: "EDITOR_FAQ_PUBLISH_QUESTION",
    answerKey: "EDITOR_FAQ_PUBLISH_ANSWER",
    animationClass: "[animation-delay:180ms]",
  },
  {
    value: "updates",
    questionKey: "EDITOR_FAQ_UPDATES_QUESTION",
    answerKey: "EDITOR_FAQ_UPDATES_ANSWER",
    animationClass: "[animation-delay:225ms]",
  },
  {
    value: "rollback",
    questionKey: "EDITOR_FAQ_ROLLBACK_QUESTION",
    answerKey: "EDITOR_FAQ_ROLLBACK_ANSWER",
    animationClass: "[animation-delay:270ms]",
  },
] as const;

export function WorkspaceKnowledgeHeaderActions({
  controller,
}: {
  controller: WorkspaceGuidanceController;
}) {
  const { t } = useTranslation("knowledge");
  const [historyOpen, setHistoryOpen] = useState(false);
  const layer = controller.layer;
  if (!layer) return null;

  const pending =
    controller.saveDraftMutation.isPending ||
    controller.publishMutation.isPending ||
    controller.saveAndPublishMutation.isPending;
  const canSaveAndPublish =
    Boolean(controller.draft.trim()) &&
    (controller.hasUnsavedChanges || Boolean(layer.currentDraft?.id));
  const canPublishWithoutSaving =
    Boolean(layer.currentDraft?.id) ||
    (Boolean(controller.draft.trim()) && controller.hasUnsavedChanges);
  const canSaveDraft = Boolean(controller.draft.trim()) && controller.hasUnsavedChanges;
  const canOpenPublishOptions = canSaveAndPublish || canPublishWithoutSaving || canSaveDraft;
  const canViewHistory =
    !controller.historyQuery.isLoading &&
    controller.history.length > 0 &&
    !controller.historyQuery.error;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        className="h-10"
        disabled={!canViewHistory || pending}
        onClick={() => setHistoryOpen(true)}
      >
        {t("HISTORY_ACTION")}
      </Button>
      <ButtonGroup>
        <Button
          className="h-10"
          disabled={!canSaveAndPublish || pending}
          loading={
            controller.saveAndPublishMutation.isPending || controller.publishMutation.isPending
          }
          onClick={() => {
            if (controller.hasUnsavedChanges) {
              controller.saveAndPublish();
            } else {
              controller.publish({ notificationKey: "SAVED_AND_PUBLISHED" });
            }
          }}
        >
          {t("SAVE_AND_PUBLISH")}
        </Button>
        <ButtonGroupSeparator />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              className="size-10"
              aria-label={t("PUBLISH_OPTIONS")}
              disabled={!canOpenPublishOptions || pending}
              variant="default"
            >
              <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              disabled={!canPublishWithoutSaving || pending}
              onSelect={() => {
                if (layer.currentDraft?.id) {
                  controller.publish({ preserveUnsavedChanges: true });
                } else {
                  controller.saveAndPublish();
                }
              }}
            >
              <Send data-icon="inline-start" />
              {t("PUBLISH_WITHOUT_SAVING")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={!canSaveDraft || pending}
              onSelect={() => controller.saveDraft()}
            >
              <FilePenLine data-icon="inline-start" />
              {t("SAVE_DRAFT_ONLY")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ButtonGroup>
      <WorkspaceKnowledgeHistoryDrawer
        controller={controller}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
      />
    </div>
  );
}

export function WorkspaceKnowledgeEditor({
  controller,
}: {
  controller: WorkspaceGuidanceController;
}) {
  const { t } = useTranslation("knowledge");
  const layer = controller.layer!;

  return (
    <section aria-labelledby="workspace-knowledge-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 id="workspace-knowledge-title" className="text-title2 font-bold text-label-primary">
            {t("EDITOR_TITLE")}
          </h2>
          <p id="workspace-knowledge-description" className="mt-1 text-body text-label-secondary">
            {t("EDITOR_DESCRIPTION")}
          </p>
        </div>
      </div>

      {layer.removedAt ? <RemovedGuidanceAlert isProject={false} /> : null}

      <div className="mt-6" aria-describedby="workspace-knowledge-description">
        <MarkdownPlateEditor
          ariaLabel={t("EDITOR_FIELD_LABEL")}
          disabled={controller.saveDraftMutation.isPending || controller.publishMutation.isPending}
          onChange={controller.setDraft}
          exportFilename="workspace-knowledge.md"
          placeholder={t("EDITOR_PLACEHOLDER")}
          value={controller.draft}
        />
      </div>

      <section
        className="mt-20 pt-16 sm:mt-24 sm:pt-20"
        aria-labelledby="workspace-knowledge-faq-title"
      >
        <div className="mx-auto max-w-3xl text-center motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300 motion-reduce:animate-none">
          <h3
            id="workspace-knowledge-faq-title"
            className="text-title font-bold text-label-primary"
          >
            {t("EDITOR_FAQ_TITLE")}
          </h3>
          <p className="mt-4 text-body leading-7 text-label-secondary">
            {t("EDITOR_FAQ_DESCRIPTION")}
          </p>
        </div>
        <Accordion
          type="single"
          collapsible
          defaultValue="business"
          className="mx-auto mt-12 max-w-4xl"
        >
          {FAQ_ITEMS.map((item) => (
            <AccordionItem
              key={item.value}
              value={item.value}
              className={`motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:fill-mode-both motion-safe:duration-200 motion-reduce:animate-none ${item.animationClass}`}
            >
              <AccordionTrigger className="py-6 text-left text-title3 font-semibold hover:no-underline sm:text-title2">
                {t(item.questionKey)}
              </AccordionTrigger>
              <AccordionContent className="max-w-3xl pb-7 text-body leading-7 text-label-secondary">
                {t(item.answerKey)}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
    </section>
  );
}

export function GuidanceEditor({ controller }: { controller: WorkspaceGuidanceController }) {
  const { t } = useTranslation("knowledge");
  const layer = controller.layer!;
  const currentRevision = layer.currentDraft ?? layer.currentPublished ?? null;
  const hasContent = Boolean(currentRevision?.content);

  return (
    <section
      className="overflow-hidden rounded-xl border bg-card"
      aria-labelledby="guidance-editor-title"
    >
      <div className="p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="guidance-editor-title" className="text-title2 font-bold text-label-primary">
            {t(controller.isProject ? "PROJECT_EDITOR_TITLE" : "EDITOR_TITLE")}
          </h2>
          {currentRevision ? <RevisionStatusBadge status={currentRevision.status} /> : null}
        </div>
        <p className="mt-2 max-w-3xl text-footnote leading-6 text-label-secondary">
          {t(controller.isProject ? "PROJECT_EDITOR_DESCRIPTION" : "EDITOR_DESCRIPTION")}
        </p>

        {layer.removedAt ? <RemovedGuidanceAlert isProject={controller.isProject} /> : null}

        <div className="mt-6">
          <label htmlFor="workspace-guidance-content" className="text-headline text-label-primary">
            {t("EDITOR_FIELD_LABEL")}
          </label>
          <p id="workspace-guidance-help" className="mt-1 text-caption text-label-secondary">
            {t("EDITOR_HELP")}
          </p>
          <Textarea
            id="workspace-guidance-content"
            aria-describedby="workspace-guidance-help"
            className="mt-3 min-h-[26rem] resize-y text-body leading-7"
            disabled={
              controller.saveDraftMutation.isPending || controller.publishMutation.isPending
            }
            value={controller.draft}
            onChange={(event) => controller.setDraft(event.target.value)}
            placeholder={t("EDITOR_PLACEHOLDER")}
          />
        </div>

        {controller.isProject ? <ProjectGuidanceMode controller={controller} /> : null}
      </div>

      <div className="flex flex-col gap-4 border-t bg-muted/20 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-caption text-label-secondary" aria-live="polite">
            {currentRevision
              ? t("REVISION_DETAIL", { revision: currentRevision.revisionNumber })
              : t("NO_REVISION_YET")}
          </p>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            disabled={
              !hasContent || Boolean(layer.removedAt) || controller.removePreviewMutation.isPending
            }
            loading={controller.removePreviewMutation.isPending}
            onClick={() => void controller.previewRemoval()}
          >
            <Trash2 data-icon="inline-start" />
            {t("REMOVE_ACTION")}
          </Button>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {controller.hasUnsavedChanges || controller.saveDraftMutation.isPending ? (
            <Button
              variant="outline"
              disabled={
                !controller.draft.trim() ||
                controller.saveDraftMutation.isPending ||
                controller.publishMutation.isPending
              }
              loading={controller.saveDraftMutation.isPending}
              onClick={() => void controller.saveDraft()}
            >
              {t("SAVE_DRAFT")}
            </Button>
          ) : null}
          <Button
            disabled={
              !layer.currentDraft?.id ||
              controller.hasUnsavedChanges ||
              controller.saveDraftMutation.isPending ||
              controller.publishMutation.isPending
            }
            loading={controller.publishMutation.isPending}
            onClick={() => void controller.publish()}
          >
            {t("PUBLISH_ACTION")}
          </Button>
        </div>
      </div>
    </section>
  );
}

function RemovedGuidanceAlert({ isProject }: { isProject: boolean }) {
  const { t } = useTranslation("knowledge");
  return (
    <Alert className="mt-5">
      <AlertTitle>{t(isProject ? "PROJECT_REMOVED_TITLE" : "REMOVED_TITLE")}</AlertTitle>
      <AlertDescription>
        {t(isProject ? "PROJECT_REMOVED_DESCRIPTION" : "REMOVED_DESCRIPTION")}
      </AlertDescription>
    </Alert>
  );
}

function ProjectGuidanceMode({ controller }: { controller: WorkspaceGuidanceController }) {
  const { t } = useTranslation("knowledge");
  return (
    <div className="mt-5 rounded-lg border bg-muted/30 p-4">
      <label
        htmlFor="project-guidance-mode"
        className="text-footnote font-semibold text-label-primary"
      >
        {t("PROJECT_MODE_LABEL")}
      </label>
      <Select
        disabled={controller.saveDraftMutation.isPending || controller.publishMutation.isPending}
        value={controller.projectMode}
        onValueChange={(value) => controller.setProjectMode(value as "supplement" | "override")}
      >
        <SelectTrigger
          id="project-guidance-mode"
          aria-label={t("PROJECT_MODE_LABEL")}
          className="mt-2 w-full sm:max-w-md"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="supplement">{t("PROJECT_MODE_SUPPLEMENT")}</SelectItem>
          <SelectItem value="override">{t("PROJECT_MODE_OVERRIDE")}</SelectItem>
        </SelectContent>
      </Select>
      <p className="mt-2 text-caption text-label-secondary">{t("PROJECT_MODE_HELP")}</p>
    </div>
  );
}
