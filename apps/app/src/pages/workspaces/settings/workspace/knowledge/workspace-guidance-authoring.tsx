import { Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Alert, AlertDescription, AlertTitle } from "@arclayer/ui/alert";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@arclayer/ui/accordion";
import { Button } from "@arclayer/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { Textarea } from "@arclayer/ui/textarea";
import { MarkdownPlateEditor } from "@/components/editor/markdown-plate-editor";

import type { WorkspaceGuidanceController } from "./use-workspace-guidance-controller";

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
    value: "save",
    questionKey: "EDITOR_FAQ_SAVE_QUESTION",
    answerKey: "EDITOR_FAQ_SAVE_ANSWER",
    animationClass: "[animation-delay:180ms]",
  },
  {
    value: "updates",
    questionKey: "EDITOR_FAQ_UPDATES_QUESTION",
    answerKey: "EDITOR_FAQ_UPDATES_ANSWER",
    animationClass: "[animation-delay:225ms]",
  },
] as const;

export function WorkspaceKnowledgeEditor({
  controller,
}: {
  controller: WorkspaceGuidanceController;
}) {
  const { t } = useTranslation("knowledge");
  const layer = controller.layer!;
  const savePending = controller.saveMutation.isPending;

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
        <Button
          disabled={savePending || !controller.hasUnsavedChanges || !controller.content.trim()}
          loading={savePending}
          onClick={() => controller.save()}
        >
          {t("SAVE_ACTION")}
        </Button>
      </div>

      {layer.removedAt ? <RemovedGuidanceAlert isProject={false} /> : null}

      <div className="mt-6" aria-describedby="workspace-knowledge-description">
        <MarkdownPlateEditor
          ariaLabel={t("EDITOR_FIELD_LABEL")}
          disabled={savePending}
          onChange={controller.setContent}
          exportFilename="workspace-knowledge.md"
          placeholder={t("EDITOR_PLACEHOLDER")}
          value={controller.content}
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
  const hasContent = Boolean(layer.currentPublished?.content);

  return (
    <section
      className="overflow-hidden rounded-xl border bg-card"
      aria-labelledby="guidance-editor-title"
    >
      <div className="p-4 sm:p-6">
        <h2 id="guidance-editor-title" className="text-title2 font-bold text-label-primary">
          {t(controller.isProject ? "PROJECT_EDITOR_TITLE" : "EDITOR_TITLE")}
        </h2>
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
            disabled={controller.saveMutation.isPending}
            value={controller.content}
            onChange={(event) => controller.setContent(event.target.value)}
            placeholder={t("EDITOR_PLACEHOLDER")}
          />
        </div>

        {controller.isProject ? <ProjectGuidanceMode controller={controller} /> : null}
      </div>

      <div className="flex flex-col gap-4 border-t bg-muted/20 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
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
        <Button
          className="lg:self-end"
          disabled={
            !controller.content.trim() ||
            !controller.hasUnsavedChanges ||
            controller.saveMutation.isPending
          }
          loading={controller.saveMutation.isPending}
          onClick={() => void controller.save()}
        >
          {t("SAVE_ACTION")}
        </Button>
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
        disabled={controller.saveMutation.isPending}
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
