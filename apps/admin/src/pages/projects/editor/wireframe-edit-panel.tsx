import { Button } from "@arclayer/ui/button";
import type {
  BuilderComponentCatalogOut,
  BuilderGlobalSectionDependencyGraphOut,
  BuilderRevisionGlobalSectionOut,
  BuilderRevisionPageOut,
  WireframeSectionV1Output,
} from "@arclayer/openapi";
import { ArrowDown, ArrowUp, Copy, Trash2 } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";

import {
  WireframeInteractionEditor,
  WireframeResponsiveEditor,
} from "@/pages/projects/editor/wireframe-binding-rule-editors";
import { WireframeCompositionEditor } from "@/pages/projects/editor/wireframe-composition-editor";
import { WireframeGlobalReferenceControl } from "@/pages/projects/editor/wireframe-global-reference-control";
import type { WireframeChangeOperation } from "@/pages/projects/editor/use-project-editor-controller";

interface WireframeEditPanelProps {
  page: BuilderRevisionPageOut;
  section: WireframeSectionV1Output | null;
  componentCatalog: BuilderComponentCatalogOut | null;
  globalSections: BuilderRevisionGlobalSectionOut[];
  globalSectionGraph: BuilderGlobalSectionDependencyGraphOut | null;
  disabled: boolean;
  disabledReason: string;
  onPreview: (operations: WireframeChangeOperation[]) => void;
}

export function WireframeEditPanel(props: WireframeEditPanelProps) {
  if (!props.page.wireframe) return <InitializeWireframe {...props} />;
  if (!props.section) return null;
  return <SectionEditor {...props} section={props.section} />;
}

function InitializeWireframe(props: WireframeEditPanelProps) {
  const { t } = useTranslation("account");
  const catalog = props.componentCatalog?.catalog;
  return (
    <form
      className="mt-6 border-t border-border pt-5"
      onSubmit={(event) => {
        event.preventDefault();
        props.onPreview([
          {
            type: "wireframe.initialize",
            operationId: globalThis.crypto.randomUUID(),
            itemId: props.page.itemId,
            expectedDraftVersion: props.page.versionNumber,
            componentCatalogVersion: catalog?.catalogVersion ?? "",
            sections: [],
          },
        ]);
      }}
    >
      <h3 className="text-footnote font-semibold text-label-primary">
        {t("CREATION_EDITOR_WIREFRAME_INITIALIZE_ACTION_TITLE")}
      </h3>
      <p className="mt-1 text-caption leading-5 text-label-secondary">
        {t("CREATION_EDITOR_WIREFRAME_INITIALIZE_ACTION_DESC")}
      </p>
      {catalog ? (
        <div className="mt-4 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
          <p className="text-caption font-medium text-label-primary">
            {localizedText(catalog.nameByLocale)}
          </p>
          <p className="mt-1 font-mono text-caption text-label-secondary">
            {catalog.catalogVersion} · {catalog.checksum.slice(0, 18)}…
          </p>
        </div>
      ) : null}
      <Button type="submit" className="mt-3 min-h-11 w-full" disabled={props.disabled || !catalog}>
        {t("CREATION_EDITOR_WIREFRAME_PREVIEW_INITIALIZE")}
      </Button>
      {props.disabledReason ? (
        <p className="mt-2 text-caption text-label-secondary">{props.disabledReason}</p>
      ) : null}
    </form>
  );
}

function SectionEditor({
  page,
  section,
  componentCatalog,
  globalSections,
  globalSectionGraph,
  disabled,
  disabledReason,
  onPreview,
}: WireframeEditPanelProps & { section: WireframeSectionV1Output }) {
  const { t } = useTranslation("account");
  const id = useId();
  const components = componentCatalog?.catalog.components ?? [];
  const sections = page.wireframe?.sections ?? [];
  const index = sections.findIndex((candidate) => candidate.id === section.id);
  const base = {
    itemId: page.itemId,
    expectedDraftVersion: page.versionNumber,
    sectionId: section.id,
  };
  return (
    <section className="mt-6 border-t border-border pt-5" aria-labelledby={`${id}-heading`}>
      <div className="flex items-center justify-between gap-3">
        <h3 id={`${id}-heading`} className="text-footnote font-semibold text-label-primary">
          {t("CREATION_EDITOR_WIREFRAME_EDIT_SECTION_TITLE")}
        </h3>
        <div className="flex items-center gap-1">
          <ActionButton
            label={t("CREATION_EDITOR_WIREFRAME_MOVE_UP")}
            icon={ArrowUp}
            disabled={disabled || index <= 0}
            onClick={() =>
              onPreview([
                {
                  ...base,
                  type: "wireframe.section.reorder",
                  operationId: globalThis.crypto.randomUUID(),
                  index: index - 1,
                },
              ])
            }
          />
          <ActionButton
            label={t("CREATION_EDITOR_WIREFRAME_MOVE_DOWN")}
            icon={ArrowDown}
            disabled={disabled || index < 0 || index >= sections.length - 1}
            onClick={() =>
              onPreview([
                {
                  ...base,
                  type: "wireframe.section.reorder",
                  operationId: globalThis.crypto.randomUUID(),
                  index: index + 1,
                },
              ])
            }
          />
          <ActionButton
            label={t("CREATION_EDITOR_WIREFRAME_DUPLICATE_SECTION")}
            icon={Copy}
            disabled={disabled || index < 0}
            onClick={() => {
              const suffix = globalThis.crypto.randomUUID();
              onPreview([
                {
                  ...base,
                  type: "wireframe.section.duplicate",
                  operationId: globalThis.crypto.randomUUID(),
                  newSectionId: `${section.id}-${suffix}`,
                  newIntentId: `${section.intentId}-${suffix}`,
                  index: index + 1,
                },
              ]);
            }}
          />
          <ActionButton
            label={t("CREATION_EDITOR_WIREFRAME_REMOVE_SECTION")}
            icon={Trash2}
            disabled={disabled}
            destructive
            onClick={() =>
              onPreview([
                {
                  ...base,
                  type: "wireframe.section.remove",
                  operationId: globalThis.crypto.randomUUID(),
                },
              ])
            }
          />
        </div>
      </div>
      {disabledReason ? (
        <p className="mt-2 text-caption text-label-secondary">{disabledReason}</p>
      ) : null}
      <WireframeGlobalReferenceControl
        page={page}
        section={section}
        globalSections={globalSections}
        graph={globalSectionGraph}
        disabled={disabled}
        onPreview={onPreview}
      />
      <WireframeCompositionEditor
        key={`${section.id}:composition`}
        page={page}
        section={section}
        components={components}
        disabled={disabled}
        onPreview={onPreview}
      />
      <WireframeResponsiveEditor
        key={`${section.id}:responsive`}
        page={page}
        section={section}
        disabled={disabled}
        onPreview={onPreview}
      />
      <WireframeInteractionEditor
        key={`${section.id}:interactions`}
        page={page}
        section={section}
        disabled={disabled}
        onPreview={onPreview}
      />
    </section>
  );
}

function ActionButton({
  label,
  icon: Icon,
  disabled,
  destructive,
  onClick,
}: {
  label: string;
  icon: typeof ArrowUp;
  disabled: boolean;
  destructive?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className={destructive ? "min-h-11 min-w-11 text-negative" : "min-h-11 min-w-11"}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon className="size-4" aria-hidden="true" />
    </Button>
  );
}

function localizedText(values: Record<string, string>): string {
  const locale = document.documentElement.lang === "zh-CN" ? "zh-CN" : "en-US";
  return values[locale] ?? values["en-US"] ?? Object.values(values)[0] ?? "";
}
