import { ScrollArea } from "@arclayer/ui/scroll-area";
import type {
  BuilderRevisionPageOut,
  BuilderWireframeTraceabilityOut,
  WireframeSectionV1Output,
} from "@arclayer/openapi";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  CircleDashed,
  Link2,
  PanelsTopLeft,
  ScanLine,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";

import { BaseTag, lucideTagIcon } from "@/components/ui/tags";

interface WireframeInspectorProps {
  page: BuilderRevisionPageOut | null;
  section: WireframeSectionV1Output | null;
  generationPanel?: ReactNode;
  editPanel?: ReactNode;
}

export function WireframeInspector({
  page,
  section,
  generationPanel,
  editPanel,
}: WireframeInspectorProps) {
  const { t } = useTranslation("account");
  const wireframe = page?.wireframe;
  const sections = wireframe?.sections ?? [];
  return (
    <aside
      className="flex w-[360px] shrink-0 flex-col border-l border-border bg-background"
      aria-label={t("CREATION_EDITOR_WIREFRAME_INSPECTOR_LABEL")}
    >
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <ScanLine className="size-4 text-label-secondary" />
        <h2 className="text-footnote font-semibold text-label-primary">
          {t("CREATION_EDITOR_WIREFRAME_INSPECTOR_TITLE")}
        </h2>
      </div>
      {page ? <TraceabilitySummary traceability={page.wireframeTraceability} /> : null}
      <ScrollArea className="min-h-0 min-w-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:!block">
        {generationPanel}
        {!page || !wireframe ? (
          <div className="flex min-h-72 flex-col items-center justify-center px-8 py-10 text-center">
            <span className="mb-4 flex size-10 items-center justify-center rounded-lg bg-muted text-label-secondary">
              <PanelsTopLeft className="size-5" />
            </span>
            <h3 className="text-body font-semibold text-label-primary">
              {t("CREATION_EDITOR_WIREFRAME_INSPECTOR_EMPTY_TITLE")}
            </h3>
            <p className="mt-2 text-footnote leading-5 text-label-secondary">
              {t("CREATION_EDITOR_WIREFRAME_INSPECTOR_EMPTY_DESC")}
            </p>
          </div>
        ) : (
          <div className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-caption font-medium text-label-secondary">
                  {t("CREATION_EDITOR_WIREFRAME_PAGE_LABEL")}
                </p>
                <h3 className="mt-1 truncate text-title-3 font-semibold text-label-primary">
                  {page.title}
                </h3>
              </div>
              <BaseTag>
                {t("CREATION_EDITOR_WIREFRAME_SECTION_COUNT", { count: sections.length })}
              </BaseTag>
            </div>
            <dl className="mt-5 space-y-4 border-t border-border pt-5">
              <InspectorValue
                label={t("CREATION_EDITOR_WIREFRAME_DESIGN_VERSION")}
                value={wireframe.designSystemVersionId}
              />
              <InspectorValue
                label={t("CREATION_EDITOR_WIREFRAME_CATALOG_VERSION")}
                value={wireframe.componentCatalogVersion}
              />
            </dl>

            {section ? (
              <section
                className="mt-6 border-t border-border pt-5"
                aria-labelledby="wireframe-section-heading"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-caption text-label-secondary">
                      {section.intentId}
                    </p>
                    <h3
                      id="wireframe-section-heading"
                      className="mt-1 truncate text-body font-semibold text-label-primary"
                    >
                      {section.label}
                    </h3>
                  </div>
                  <BaseTag icon={lucideTagIcon(Boxes)}>{section.variantKey}</BaseTag>
                </div>
                <InspectorValue
                  className="mt-4"
                  label={t("CREATION_EDITOR_WIREFRAME_COMPONENT")}
                  value={section.componentKey}
                />
                <LayoutSummary section={section} />
                <BindingList section={section} />
                <RuleList section={section} />
              </section>
            ) : (
              <p className="mt-6 border-t border-border pt-5 text-footnote text-label-secondary">
                {t("CREATION_EDITOR_WIREFRAME_SELECT_SECTION")}
              </p>
            )}

            {editPanel}
          </div>
        )}
      </ScrollArea>
    </aside>
  );
}

function LayoutSummary({ section }: { section: WireframeSectionV1Output }) {
  const { t } = useTranslation("account");
  const layout = section.layout ?? {
    mode: "stack",
    width: "full",
    align: "stretch",
    gap: "md",
    columns: 1,
    span: 12,
  };
  const overrides = section.responsiveLayouts ?? [];
  return (
    <section
      className="mt-5 border-t border-border pt-5"
      aria-labelledby="wireframe-layout-summary-heading"
    >
      <h4
        id="wireframe-layout-summary-heading"
        className="text-footnote font-semibold text-label-primary"
      >
        {t("CREATION_EDITOR_WIREFRAME_LAYOUT_TITLE")}
      </h4>
      <p className="mt-2 font-mono text-caption text-label-secondary">
        {layout.mode} · {layout.width} · {layout.align} · {layout.gap} · {layout.columns}/
        {layout.span}
      </p>
      {overrides.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {overrides.map((override) => (
            <li key={override.breakpoint} className="rounded-lg border border-border px-3 py-2">
              <p className="text-caption font-medium text-label-primary">
                {t(`CREATION_EDITOR_WIREFRAME_VIEWPORT_${override.breakpoint.toUpperCase()}`)}
              </p>
              <p className="mt-1 font-mono text-caption text-label-secondary">
                {override.layout.mode} · {override.layout.width} · {override.layout.align} ·{" "}
                {override.layout.gap} · {override.layout.columns}/{override.layout.span}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function TraceabilitySummary({ traceability }: { traceability: BuilderWireframeTraceabilityOut }) {
  const { t } = useTranslation("account");
  const needsAttention = traceability.status === "partial" || traceability.status === "orphaned";
  const missingIntentIds = traceability.missingIntentIds ?? [];
  const orphanedSectionIds = traceability.orphanedSectionIds ?? [];
  const Icon =
    traceability.status === "aligned"
      ? CheckCircle2
      : needsAttention
        ? AlertTriangle
        : CircleDashed;
  return (
    <section
      className="shrink-0 border-b border-border px-4 py-3"
      aria-labelledby="wireframe-traceability-heading"
    >
      <div className="flex items-center gap-2">
        <Icon
          className={needsAttention ? "size-4 text-warning" : "size-4 text-label-secondary"}
          aria-hidden="true"
        />
        <h3
          id="wireframe-traceability-heading"
          className="text-caption font-semibold text-label-primary"
        >
          {t(`CREATION_EDITOR_WIREFRAME_TRACEABILITY_${traceability.status.toUpperCase()}`)}
        </h3>
      </div>
      {missingIntentIds.length > 0 ? (
        <p className="mt-2 break-words text-caption leading-5 text-label-secondary">
          {t("CREATION_EDITOR_WIREFRAME_TRACEABILITY_MISSING", {
            intents: missingIntentIds.join(", "),
          })}
        </p>
      ) : null}
      {orphanedSectionIds.length > 0 ? (
        <p className="mt-2 break-words text-caption leading-5 text-label-secondary">
          {t("CREATION_EDITOR_WIREFRAME_TRACEABILITY_ORPHANED_SECTIONS", {
            sections: orphanedSectionIds.join(", "),
          })}
        </p>
      ) : null}
    </section>
  );
}

function BindingList({ section }: { section: WireframeSectionV1Output }) {
  const { t } = useTranslation("account");
  const bindings = section.bindings ?? [];
  return (
    <section className="mt-5" aria-labelledby="wireframe-bindings-heading">
      <h4
        id="wireframe-bindings-heading"
        className="text-footnote font-semibold text-label-primary"
      >
        {t("CREATION_EDITOR_WIREFRAME_BINDINGS")}
      </h4>
      <ul className="mt-3 space-y-2">
        {bindings.length > 0 ? (
          bindings.map((binding) => (
            <li key={binding.slotKey} className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate text-footnote font-medium text-label-primary">
                  {binding.slotKey}
                </span>
                <BaseTag
                  color={binding.kind === "missing" ? "gold" : "default"}
                  icon={
                    binding.kind === "missing" ? lucideTagIcon(AlertTriangle) : lucideTagIcon(Link2)
                  }
                >
                  {t(`CREATION_EDITOR_WIREFRAME_BINDING_${binding.kind.toUpperCase()}`)}
                </BaseTag>
              </div>
              <p className="mt-2 break-words font-mono text-caption text-label-secondary">
                {binding.kind === "field"
                  ? binding.fieldKey
                  : binding.kind === "missing"
                    ? t(`CREATION_EDITOR_WIREFRAME_MISSING_${binding.reason.toUpperCase()}`)
                    : formatLiteral(binding.value)}
              </p>
            </li>
          ))
        ) : (
          <li className="text-footnote text-label-secondary">
            {t("CREATION_EDITOR_WIREFRAME_BINDINGS_EMPTY")}
          </li>
        )}
      </ul>
    </section>
  );
}

function RuleList({ section }: { section: WireframeSectionV1Output }) {
  const { t } = useTranslation("account");
  const responsiveRules = section.responsiveRules ?? [];
  const interactionRules = section.interactionRules ?? [];
  return (
    <section className="mt-5 border-t border-border pt-5" aria-labelledby="wireframe-rules-heading">
      <h4 id="wireframe-rules-heading" className="text-footnote font-semibold text-label-primary">
        {t("CREATION_EDITOR_WIREFRAME_RESPONSIVE_RULES")}
      </h4>
      <div className="mt-3 flex flex-wrap gap-2">
        {responsiveRules.length > 0 ? (
          responsiveRules.map((rule) => (
            <BaseTag key={rule.breakpoint}>
              {t(`CREATION_EDITOR_WIREFRAME_VIEWPORT_${rule.breakpoint.toUpperCase()}`)} ·{" "}
              {rule.layout} · {rule.columns}
            </BaseTag>
          ))
        ) : (
          <p className="text-footnote text-label-secondary">
            {t("CREATION_EDITOR_WIREFRAME_RESPONSIVE_RULES_EMPTY")}
          </p>
        )}
      </div>
      {interactionRules.length > 0 ? (
        <div className="mt-4 space-y-2">
          {interactionRules.map((rule, index) => (
            <p
              key={`${rule.event}:${rule.action}:${index}`}
              className="font-mono text-caption text-label-secondary"
            >
              {rule.event} → {rule.action}
              {rule.target ? ` · ${rule.target}` : ""}
            </p>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function InspectorValue({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-caption font-medium text-label-secondary">{label}</dt>
      <dd className="mt-1 break-all font-mono text-footnote text-label-primary">{value}</dd>
    </div>
  );
}

function formatLiteral(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}
