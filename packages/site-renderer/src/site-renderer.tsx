import type { CSSProperties } from "react";

import "./styles.css";

import {
  assertRenderDocument,
  SiteRendererContractError,
  type SiteInteraction,
  type SiteRenderDocument,
  type SiteRenderSection,
} from "./contracts";
import { resolveVisitorComponent } from "./registry";

type SiteRendererProps = Readonly<{
  document: SiteRenderDocument;
  className?: string;
  interactionMode?: "active" | "read-only";
  onInteraction?: (interaction: SiteInteraction) => void;
  selectedSectionId?: string | null;
  onSectionSelect?: (sectionId: string) => void;
  sectionSelectionLabel?: (section: SiteRenderSection) => string;
  previewStateKey?: string;
  previewBreakpoint?: string | null;
}>;

const REQUIRED_TOKEN_PATHS = Object.freeze({
  "semantic.color.surface.canvas": "--arc-site-surface",
  "semantic.color.text.primary": "--arc-site-text",
  "semantic.color.action.primary": "--arc-site-action",
});

export function SiteRenderer({
  document,
  className,
  interactionMode = "active",
  onInteraction,
  selectedSectionId = null,
  onSectionSelect,
  sectionSelectionLabel,
  previewStateKey = "default",
  previewBreakpoint = null,
}: SiteRendererProps) {
  assertRenderDocument(document);
  const style = documentStyle(document);
  return (
    <main
      className={["arc-site", className].filter(Boolean).join(" ")}
      data-document-hash={document.documentHash}
      data-renderer={`${document.renderer.profile}@${document.renderer.version}`}
      data-theme={document.theme.key}
      dir="ltr"
      lang={document.locale}
      style={style}
    >
      {document.sections.map((section) => (
        <RenderSection
          key={section.instanceId}
          section={section}
          interactionMode={interactionMode}
          onInteraction={onInteraction}
          selected={section.sourceSectionId === selectedSectionId}
          onSectionSelect={onSectionSelect}
          selectionLabel={sectionSelectionLabel?.(section)}
          previewStateKey={previewStateKey}
          previewBreakpoint={previewBreakpoint}
        />
      ))}
    </main>
  );
}

function RenderSection({
  section,
  interactionMode,
  onInteraction,
  selected,
  onSectionSelect,
  selectionLabel,
  previewStateKey,
  previewBreakpoint,
}: Readonly<{
  section: SiteRenderSection;
  interactionMode: "active" | "read-only";
  onInteraction?: (interaction: SiteInteraction) => void;
  selected: boolean;
  onSectionSelect?: (sectionId: string) => void;
  selectionLabel?: string;
  previewStateKey: string;
  previewBreakpoint: string | null;
}>) {
  const Component = resolveVisitorComponent(section.componentKey);
  const recipeStyle = sectionRecipeStyle(
    section,
    selected ? previewStateKey : "default",
    selected ? previewBreakpoint : null,
  );
  return (
    <div
      className="arc-site-section-frame"
      data-component={section.componentKey}
      data-selected={selected || undefined}
      style={recipeStyle}
    >
      <Component
        section={section}
        interactionMode={interactionMode}
        onInteraction={onInteraction}
      />
      {onSectionSelect ? (
        <button
          type="button"
          className="arc-site-section-selector"
          aria-label={selectionLabel ?? section.label}
          aria-pressed={selected}
          onClick={() => onSectionSelect(section.sourceSectionId)}
        />
      ) : null}
    </div>
  );
}

function documentStyle(document: SiteRenderDocument): CSSProperties {
  const values = new Map(document.theme.tokens.map((token) => [token.path, token.value]));
  const style: Record<string, string | number> = {};
  for (const [path, property] of Object.entries(REQUIRED_TOKEN_PATHS)) {
    const value = values.get(path);
    if (typeof value !== "string" && typeof value !== "number") {
      throw new SiteRendererContractError(
        "SITE_RENDERER_TOKEN_REQUIRED",
        `Renderer token ${path} is required by arclayer-site-v1`,
      );
    }
    style[property] = value;
  }
  const body =
    document.theme.typography.find((role) => role.key === "body") ?? document.theme.typography[0];
  if (body) {
    style["--arc-site-font-family"] = body.fontFamily.join(", ");
    style["--arc-site-font-size"] = body.fontSize;
    style["--arc-site-line-height"] = body.lineHeight;
  }
  return style as CSSProperties;
}

function sectionRecipeStyle(
  section: SiteRenderSection,
  stateKey: string,
  breakpoint: string | null,
): CSSProperties | undefined {
  const recipe = section.componentRecipe;
  if (!recipe) return undefined;
  const values = {
    ...recipe.states.find((item) => item.stateKey === "default")?.styleValues,
    ...recipe.states.find((item) => item.stateKey === stateKey)?.styleValues,
    ...recipe.responsiveOverrides
      ?.find((item) => item.breakpoint === breakpoint)
      ?.states.find((item) => item.stateKey === stateKey)?.styleValues,
  };
  const background = values["surface.background"];
  const color = values["text.primary"];
  const action = values["action.background"];
  return {
    ...(typeof background === "string" ? { backgroundColor: background } : {}),
    ...(typeof color === "string" ? { color } : {}),
    ...(typeof action === "string" ? ({ "--arc-site-action": action } as CSSProperties) : {}),
  };
}
