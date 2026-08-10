import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { Textarea } from "@arclayer/ui/textarea";
import type {
  BuilderChangeSetPreviewOut,
  BuilderRevisionPageOut,
  BuilderSectionIntentV1,
} from "@arclayer/openapi";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Plus,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { SitemapPlanningDraft } from "@/pages/projects/editor/use-project-editor-controller";

interface SitemapIntentEditorProps {
  page: BuilderRevisionPageOut;
  canWrite: boolean;
  preview: BuilderChangeSetPreviewOut | null;
  previewing: boolean;
  applying: boolean;
  error: string | null;
  onPreview: (draft: SitemapPlanningDraft) => void;
  onApply: () => void;
  onDiscard: () => void;
  onSyncWireframe?: () => void;
}

export function SitemapIntentEditor({
  page,
  canWrite,
  preview,
  previewing,
  applying,
  error,
  onPreview,
  onApply,
  onDiscard,
  onSyncWireframe,
}: SitemapIntentEditorProps) {
  const { t } = useTranslation("account");
  const [draft, setDraft] = useState(() => draftFromPage(page));
  const [showValidation, setShowValidation] = useState(false);
  const locked = !canWrite || previewing || applying || Boolean(preview);

  useEffect(() => {
    setDraft(draftFromPage(page));
    setShowValidation(false);
  }, [page.itemId, page.purpose, page.sectionIntents]);

  const submitPreview = () => {
    const normalized = normalizeDraft(draft);
    if (!planningIsComplete(normalized)) {
      setShowValidation(true);
      return;
    }
    setShowValidation(false);
    onPreview({ itemId: page.itemId, ...normalized });
  };

  const discard = () => {
    onDiscard();
    setDraft(draftFromPage(page));
    setShowValidation(false);
  };

  return (
    <section
      className="mt-6 min-w-0 border-t border-border pt-5"
      aria-labelledby="sitemap-planning-heading"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="sitemap-planning-heading" className="text-body font-semibold text-label-primary">
            {t("CREATION_EDITOR_SITEMAP_PLANNING_TITLE")}
          </h3>
          <p className="mt-1 text-caption leading-5 text-label-secondary">
            {t("CREATION_EDITOR_SITEMAP_PLANNING_DESC")}
          </p>
        </div>
        <span className="shrink-0 font-mono text-caption text-label-secondary">
          {t("CREATION_EDITOR_SITEMAP_INTENT_COUNT", { count: draft.sectionIntents.length })}
        </span>
      </div>

      {canAdoptWireframe(page) ? (
        <div className="mt-4 border-l-2 border-warning pl-3">
          <p className="text-footnote font-medium text-label-primary">
            {t("CREATION_EDITOR_SITEMAP_LEGACY_WIREFRAME_TITLE")}
          </p>
          <p className="mt-1 text-caption leading-5 text-label-secondary">
            {t("CREATION_EDITOR_SITEMAP_LEGACY_WIREFRAME_DESC")}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            disabled={!canWrite}
            onClick={() => setDraft(adoptWireframeDraft(page))}
          >
            <WandSparkles className="size-4" aria-hidden="true" />
            {t("CREATION_EDITOR_SITEMAP_ADOPT_WIREFRAME")}
          </Button>
        </div>
      ) : null}
      {page.wireframe && onSyncWireframe ? (
        <div className="mt-4 rounded-lg border border-primary/25 bg-primary/5 px-3 py-3">
          <p className="text-footnote font-medium text-label-primary">
            {t("CREATION_EDITOR_SITEMAP_WIREFRAME_SYNC_TITLE")}
          </p>
          <p className="mt-1 text-caption leading-5 text-label-secondary">
            {t("CREATION_EDITOR_SITEMAP_WIREFRAME_SYNC_DESC")}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            disabled={!canWrite || previewing || applying}
            onClick={onSyncWireframe}
          >
            <WandSparkles className="size-4" aria-hidden="true" />
            {t("CREATION_EDITOR_SITEMAP_WIREFRAME_SYNC_ACTION")}
          </Button>
        </div>
      ) : null}

      <div className="mt-5">
        <label
          htmlFor={`page-purpose-${page.itemId}`}
          className="text-caption font-medium text-label-primary"
        >
          {t("CREATION_EDITOR_SITEMAP_PURPOSE_LABEL")}
        </label>
        <p
          id={`page-purpose-help-${page.itemId}`}
          className="mt-1 text-caption leading-5 text-label-secondary"
        >
          {t("CREATION_EDITOR_SITEMAP_PURPOSE_HELP")}
        </p>
        <Textarea
          id={`page-purpose-${page.itemId}`}
          name="page-purpose"
          className="mt-2 min-h-20 resize-y"
          value={draft.purpose}
          disabled={locked}
          aria-describedby={`page-purpose-help-${page.itemId}`}
          aria-invalid={showValidation && !draft.purpose.trim()}
          onChange={(event) => setDraft((current) => ({ ...current, purpose: event.target.value }))}
        />
      </div>

      <div className="mt-6 flex items-center justify-between gap-3">
        <h4 className="text-footnote font-semibold text-label-primary">
          {t("CREATION_EDITOR_SITEMAP_INTENTS_TITLE")}
        </h4>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={locked}
          onClick={() =>
            setDraft((current) => ({
              ...current,
              sectionIntents: [...current.sectionIntents, createIntent()],
            }))
          }
        >
          <Plus className="size-4" aria-hidden="true" />
          {t("CREATION_EDITOR_SITEMAP_ADD_INTENT")}
        </Button>
      </div>

      <div className="mt-3 min-w-0 space-y-4">
        {draft.sectionIntents.map((intent, index) => (
          <IntentFields
            key={intent.id}
            intent={intent}
            index={index}
            total={draft.sectionIntents.length}
            disabled={locked}
            showValidation={showValidation}
            onChange={(next) =>
              setDraft((current) => ({
                ...current,
                sectionIntents: current.sectionIntents.map((item) =>
                  item.id === intent.id ? next : item,
                ),
              }))
            }
            onMove={(offset) =>
              setDraft((current) => ({
                ...current,
                sectionIntents: moveIntent(current.sectionIntents, index, index + offset),
              }))
            }
            onRemove={() =>
              setDraft((current) => ({
                ...current,
                sectionIntents: current.sectionIntents.filter((item) => item.id !== intent.id),
              }))
            }
          />
        ))}
      </div>

      {showValidation ? (
        <p className="mt-4 flex gap-2 text-caption leading-5 text-destructive" role="alert">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {t("CREATION_EDITOR_SITEMAP_REQUIRED_FIELDS")}
        </p>
      ) : null}
      {error ? (
        <p className="mt-4 text-caption leading-5 text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {preview ? (
        <PlanningReview
          preview={preview}
          applying={applying}
          onApply={onApply}
          onDiscard={discard}
        />
      ) : (
        <div className="mt-5 flex items-center justify-end border-t border-border pt-4">
          <Button type="button" disabled={!canWrite || previewing} onClick={submitPreview}>
            {previewing
              ? t("CREATION_EDITOR_SITEMAP_PREVIEWING")
              : t("CREATION_EDITOR_SITEMAP_PREVIEW")}
          </Button>
        </div>
      )}
    </section>
  );
}

function IntentFields({
  intent,
  index,
  total,
  disabled,
  showValidation,
  onChange,
  onMove,
  onRemove,
}: {
  intent: BuilderSectionIntentV1;
  index: number;
  total: number;
  disabled: boolean;
  showValidation: boolean;
  onChange: (intent: BuilderSectionIntentV1) => void;
  onMove: (offset: number) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation("account");
  const fieldId = `section-intent-${intent.id}`;
  return (
    <fieldset className="min-w-0 border-l border-border pl-3">
      <legend className="sr-only">
        {t("CREATION_EDITOR_SITEMAP_INTENT_LEGEND", { index: index + 1 })}
      </legend>
      <div className="flex items-center justify-between gap-3">
        <code className="min-w-0 flex-1 truncate text-caption text-label-secondary">
          {intent.id}
        </code>
        <div className="flex shrink-0 items-center">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("CREATION_EDITOR_SITEMAP_MOVE_UP")}
            disabled={disabled || index === 0}
            onClick={() => onMove(-1)}
          >
            <ArrowUp className="size-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("CREATION_EDITOR_SITEMAP_MOVE_DOWN")}
            disabled={disabled || index === total - 1}
            onClick={() => onMove(1)}
          >
            <ArrowDown className="size-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("CREATION_EDITOR_SITEMAP_REMOVE_INTENT")}
            disabled={disabled}
            onClick={onRemove}
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
      <label
        htmlFor={`${fieldId}-label`}
        className="mt-3 block text-caption font-medium text-label-primary"
      >
        {t("CREATION_EDITOR_SITEMAP_INTENT_LABEL")}
      </label>
      <Input
        id={`${fieldId}-label`}
        name="intent-label"
        className="mt-2"
        value={intent.label}
        disabled={disabled}
        aria-invalid={showValidation && !intent.label.trim()}
        onChange={(event) => onChange({ ...intent, label: event.target.value })}
      />
      <label
        htmlFor={`${fieldId}-goal`}
        className="mt-3 block text-caption font-medium text-label-primary"
      >
        {t("CREATION_EDITOR_SITEMAP_INTENT_GOAL")}
      </label>
      <Textarea
        id={`${fieldId}-goal`}
        name="intent-goal"
        className="mt-2 min-h-20 resize-y"
        value={intent.goal}
        disabled={disabled}
        aria-invalid={showValidation && !intent.goal.trim()}
        onChange={(event) => onChange({ ...intent, goal: event.target.value })}
      />
      <label
        htmlFor={`${fieldId}-guidance`}
        className="mt-3 block text-caption font-medium text-label-primary"
      >
        {t("CREATION_EDITOR_SITEMAP_INTENT_GUIDANCE")}
      </label>
      <Textarea
        id={`${fieldId}-guidance`}
        name="intent-guidance"
        className="mt-2 min-h-16 resize-y"
        value={intent.generationGuidance ?? ""}
        disabled={disabled}
        onChange={(event) => onChange({ ...intent, generationGuidance: event.target.value })}
      />
    </fieldset>
  );
}

function PlanningReview({
  preview,
  applying,
  onApply,
  onDiscard,
}: {
  preview: BuilderChangeSetPreviewOut;
  applying: boolean;
  onApply: () => void;
  onDiscard: () => void;
}) {
  const { t } = useTranslation(["account", "errors"]);
  const blocked = preview.issues.some((issue) => issue.severity === "blocker");
  return (
    <div className="mt-5 border-t border-border pt-4" aria-live="polite">
      <div className="flex items-center gap-2">
        {blocked ? (
          <AlertTriangle className="size-4 text-destructive" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="size-4 text-positive" aria-hidden="true" />
        )}
        <h4 className="text-footnote font-semibold text-label-primary">
          {t("CREATION_EDITOR_SITEMAP_REVIEW_TITLE")}
        </h4>
      </div>
      {preview.issues.length ? (
        <ul className="mt-3 space-y-2">
          {preview.issues.map((issue, index) => (
            <li
              key={`${issue.code}:${index}`}
              className="text-caption leading-5 text-label-secondary"
            >
              {t(issue.messageKey, { ns: "errors" })}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-caption text-label-secondary">
          {t("CREATION_EDITOR_SITEMAP_REVIEW_READY")}
        </p>
      )}
      {blocked ? (
        <p className="mt-3 text-caption text-destructive">
          {t("CREATION_EDITOR_SITEMAP_REVIEW_BLOCKED")}
        </p>
      ) : null}
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="ghost" disabled={applying} onClick={onDiscard}>
          {t("CREATION_EDITOR_SITEMAP_DISCARD")}
        </Button>
        <Button type="button" disabled={blocked || applying} onClick={onApply}>
          {applying ? t("CREATION_EDITOR_SITEMAP_APPLYING") : t("CREATION_EDITOR_SITEMAP_APPLY")}
        </Button>
      </div>
    </div>
  );
}

function draftFromPage(page: BuilderRevisionPageOut) {
  return { purpose: page.purpose ?? "", sectionIntents: [...(page.sectionIntents ?? [])] };
}

function createIntent(): BuilderSectionIntentV1 {
  return { id: `intent.${globalThis.crypto.randomUUID()}`, label: "", goal: "" };
}

function normalizeDraft(draft: ReturnType<typeof draftFromPage>) {
  return {
    purpose: draft.purpose.trim(),
    sectionIntents: draft.sectionIntents.map((intent) => ({
      ...intent,
      label: intent.label.trim(),
      goal: intent.goal.trim(),
      generationGuidance: intent.generationGuidance?.trim() || undefined,
    })),
  };
}

function planningIsComplete(draft: ReturnType<typeof normalizeDraft>) {
  return Boolean(
    draft.purpose && draft.sectionIntents.every((intent) => intent.label && intent.goal),
  );
}

function moveIntent(intents: BuilderSectionIntentV1[], from: number, to: number) {
  if (to < 0 || to >= intents.length) return intents;
  const next = [...intents];
  const [intent] = next.splice(from, 1);
  if (!intent) return intents;
  next.splice(to, 0, intent);
  return next;
}

function canAdoptWireframe(page: BuilderRevisionPageOut) {
  return (
    page.wireframeTraceability.status === "orphaned" &&
    !page.sectionIntents?.length &&
    Boolean(page.wireframe?.sections?.length)
  );
}

function adoptWireframeDraft(page: BuilderRevisionPageOut) {
  const intents = new Map<string, BuilderSectionIntentV1>();
  for (const section of page.wireframe?.sections ?? []) {
    if (!intents.has(section.intentId)) {
      intents.set(section.intentId, { id: section.intentId, label: section.label, goal: "" });
    }
  }
  return { purpose: "", sectionIntents: [...intents.values()] };
}
