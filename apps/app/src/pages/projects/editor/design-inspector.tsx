import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@arclayer/ui/button";
import { ScrollArea } from "@arclayer/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import type {
  BuilderComponentCatalogOut,
  BuilderDesignTokenOut,
  BuilderRevisionPageOut,
  ComponentCatalogComponentV1,
  ComponentCatalogStyleSlotV1,
  VisualBlueprintDocumentV1,
  WireframeSectionV1Output,
} from "@arclayer/openapi";
import { AlertTriangle, Check, Layers3, Paintbrush, RotateCcw } from "lucide-react";

import { BaseTag, lucideTagIcon } from "@/components/ui/tags";
import type { DesignChangeOperation } from "@/pages/projects/editor/use-project-design-controller";

interface DesignInspectorProps {
  page: BuilderRevisionPageOut | null;
  section: WireframeSectionV1Output | null;
  component: ComponentCatalogComponentV1 | null;
  contract: BuilderComponentCatalogOut | null;
  blueprint: VisualBlueprintDocumentV1 | null;
  stateKey: string;
  breakpoint: string | null;
  onBreakpointChange: (breakpoint: string | null) => void;
  canEdit: boolean;
  permissionReady: boolean;
  online: boolean;
  generationActive: boolean;
  generationPanel: ReactNode;
  previewActive: boolean;
  previewing: boolean;
  onPreview: (operations: readonly DesignChangeOperation[]) => void;
}

export function DesignInspector({
  page,
  section,
  component,
  contract,
  blueprint,
  stateKey,
  breakpoint,
  onBreakpointChange,
  canEdit,
  permissionReady,
  online,
  generationActive,
  generationPanel,
  previewActive,
  previewing,
  onPreview,
}: DesignInspectorProps) {
  const { t } = useTranslation("account");
  const breakpoints = Object.entries(contract?.breakpoints ?? {});
  const mutationDisabled = !canEdit || !online || generationActive || previewActive || previewing;
  const disabledReason = !permissionReady
    ? t("CREATION_EDITOR_DESIGN_PERMISSION_CHECKING")
    : !canEdit
      ? t("CREATION_EDITOR_DESIGN_PERMISSION_REQUIRED")
      : !online
        ? t("CREATION_EDITOR_DESIGN_OFFLINE_MUTATION")
        : generationActive
          ? t("CREATION_EDITOR_DESIGN_GENERATION_ACTIVE")
          : previewActive
            ? t("CREATION_EDITOR_DESIGN_REVIEW_BEFORE_EDIT")
            : previewing
              ? t("CREATION_EDITOR_DESIGN_PREVIEWING")
              : null;

  return (
    <aside
      className="flex w-[360px] shrink-0 flex-col border-l border-border bg-background"
      aria-label={t("CREATION_EDITOR_DESIGN_INSPECTOR_LABEL")}
    >
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <Paintbrush className="size-4 text-label-secondary" aria-hidden="true" />
        <h2 className="text-footnote font-semibold text-label-primary">
          {t("CREATION_EDITOR_DESIGN_INSPECTOR_TITLE")}
        </h2>
      </div>
      <ScrollArea className="min-h-0 min-w-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:!block">
        {generationPanel}
        <div className="border-t border-border">
          {!page || !section || !component || !contract ? (
            <InspectorEmpty />
          ) : (
            <div className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-caption text-label-secondary">{section.intentId}</p>
                  <h3 className="mt-1 truncate text-body font-semibold text-label-primary">
                    {section.label}
                  </h3>
                  <p className="mt-1 truncate text-caption text-label-secondary">
                    {section.componentKey} · {section.variantKey}
                  </p>
                </div>
                <BaseTag icon={lucideTagIcon(blueprint ? Check : Layers3)}>
                  {blueprint
                    ? t("CREATION_EDITOR_DESIGN_BLUEPRINT_ACTIVE")
                    : t("CREATION_EDITOR_DESIGN_WIREFRAME_ONLY")}
                </BaseTag>
              </div>

              {!blueprint ? (
                <InitializeDesign
                  page={page}
                  disabled={mutationDisabled || !page.wireframeChecksum}
                  disabledReason={
                    page.wireframeChecksum
                      ? disabledReason
                      : t("CREATION_EDITOR_DESIGN_WIREFRAME_CHECKSUM_REQUIRED")
                  }
                  onPreview={onPreview}
                />
              ) : (
                <>
                  <section
                    className="mt-6 border-t border-border pt-5"
                    aria-labelledby="design-context-heading"
                  >
                    <h3
                      id="design-context-heading"
                      className="text-footnote font-semibold text-label-primary"
                    >
                      {t("CREATION_EDITOR_DESIGN_CONTEXT_TITLE")}
                    </h3>
                    <dl className="mt-3 space-y-3">
                      <EvidenceValue
                        label={t("CREATION_EDITOR_DESIGN_STATE_LABEL")}
                        value={stateKey}
                      />
                      <EvidenceValue
                        label={t("CREATION_EDITOR_DESIGN_THEME_LABEL")}
                        value={contract.defaultThemeKey}
                      />
                    </dl>
                    <label className="mt-4 block text-caption font-medium text-label-secondary">
                      {t("CREATION_EDITOR_DESIGN_SCOPE_LABEL")}
                      <Select
                        value={breakpoint ?? "base"}
                        onValueChange={(value) =>
                          onBreakpointChange(value === "base" ? null : value)
                        }
                      >
                        <SelectTrigger
                          className="mt-2 w-full"
                          aria-label={t("CREATION_EDITOR_DESIGN_SCOPE_LABEL")}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="base">
                            {t("CREATION_EDITOR_DESIGN_SCOPE_BASE")}
                          </SelectItem>
                          {breakpoints.map(([key, value]) => (
                            <SelectItem key={key} value={key}>
                              {key} · {value}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>
                  </section>

                  <StyleSlotList
                    page={page}
                    section={section}
                    component={component}
                    blueprint={blueprint}
                    tokens={contract.designTokens ?? []}
                    stateKey={stateKey}
                    breakpoint={breakpoint}
                    disabled={mutationDisabled}
                    disabledReason={disabledReason}
                    onPreview={onPreview}
                  />
                </>
              )}

              {disabledReason ? (
                <p className="mt-5 flex items-start gap-2 text-caption leading-5 text-label-secondary">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  {disabledReason}
                </p>
              ) : null}
            </div>
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}

function InitializeDesign({
  page,
  disabled,
  disabledReason,
  onPreview,
}: Readonly<{
  page: BuilderRevisionPageOut;
  disabled: boolean;
  disabledReason: string | null;
  onPreview: (operations: readonly DesignChangeOperation[]) => void;
}>) {
  const { t } = useTranslation("account");
  return (
    <section
      className="mt-6 border-t border-border pt-5"
      aria-labelledby="design-initialize-heading"
    >
      <h3 id="design-initialize-heading" className="text-footnote font-semibold text-label-primary">
        {t("CREATION_EDITOR_DESIGN_INITIALIZE_TITLE")}
      </h3>
      <p className="mt-2 text-caption leading-5 text-label-secondary">
        {t("CREATION_EDITOR_DESIGN_INITIALIZE_DESC")}
      </p>
      <Button
        type="button"
        className="mt-4 min-h-11 w-full"
        disabled={disabled}
        title={disabledReason ?? undefined}
        onClick={() =>
          onPreview([
            {
              type: "design.initialize",
              operationId: `design-init-${globalThis.crypto.randomUUID()}`,
              itemId: page.itemId,
              expectedDraftVersion: page.versionNumber,
              sourceWireframeChecksum: page.wireframeChecksum!,
            },
          ])
        }
      >
        {t("CREATION_EDITOR_DESIGN_INITIALIZE_PREVIEW")}
      </Button>
    </section>
  );
}

function StyleSlotList({
  page,
  section,
  component,
  blueprint,
  tokens,
  stateKey,
  breakpoint,
  disabled,
  disabledReason,
  onPreview,
}: Readonly<{
  page: BuilderRevisionPageOut;
  section: WireframeSectionV1Output;
  component: ComponentCatalogComponentV1;
  blueprint: VisualBlueprintDocumentV1;
  tokens: readonly BuilderDesignTokenOut[];
  stateKey: string;
  breakpoint: string | null;
  disabled: boolean;
  disabledReason: string | null;
  onPreview: (operations: readonly DesignChangeOperation[]) => void;
}>) {
  const { t } = useTranslation("account");
  const slots = (component.styleSlots ?? []).filter((slot) =>
    (slot.requiredStates ?? []).includes(stateKey),
  );
  return (
    <section
      className="mt-6 border-t border-border pt-5"
      aria-labelledby="design-style-slots-heading"
    >
      <h3
        id="design-style-slots-heading"
        className="text-footnote font-semibold text-label-primary"
      >
        {t("CREATION_EDITOR_DESIGN_STYLE_SLOTS_TITLE")}
      </h3>
      <p className="mt-1 text-caption leading-5 text-label-secondary">
        {t("CREATION_EDITOR_DESIGN_STYLE_SLOTS_DESC")}
      </p>
      {slots.length > 0 ? (
        <div className="mt-4 divide-y divide-border border-y border-border">
          {slots.map((slot) => (
            <StyleSlotEditor
              key={slot.key}
              page={page}
              section={section}
              slot={slot}
              tokens={tokens}
              currentToken={findBlueprintToken(
                blueprint,
                section.id,
                stateKey,
                slot.key,
                breakpoint,
              )}
              stateKey={stateKey}
              breakpoint={breakpoint}
              disabled={disabled || !page.wireframeChecksum}
              disabledReason={disabledReason}
              onPreview={onPreview}
            />
          ))}
        </div>
      ) : (
        <p className="mt-4 text-caption leading-5 text-label-secondary">
          {t("CREATION_EDITOR_DESIGN_STYLE_SLOTS_EMPTY", { state: stateKey })}
        </p>
      )}
    </section>
  );
}

function StyleSlotEditor({
  page,
  section,
  slot,
  tokens,
  currentToken,
  stateKey,
  breakpoint,
  disabled,
  disabledReason,
  onPreview,
}: Readonly<{
  page: BuilderRevisionPageOut;
  section: WireframeSectionV1Output;
  slot: ComponentCatalogStyleSlotV1;
  tokens: readonly BuilderDesignTokenOut[];
  currentToken: string | null;
  stateKey: string;
  breakpoint: string | null;
  disabled: boolean;
  disabledReason: string | null;
  onPreview: (operations: readonly DesignChangeOperation[]) => void;
}>) {
  const { t } = useTranslation("account");
  const compatibleTokens = useMemo(
    () => tokens.filter((token) => token.type === slot.valueType && !token.deprecated),
    [slot.valueType, tokens],
  );
  const [selectedToken, setSelectedToken] = useState(
    currentToken ?? compatibleTokens[0]?.path ?? "",
  );
  useEffect(() => {
    setSelectedToken(currentToken ?? compatibleTokens[0]?.path ?? "");
  }, [compatibleTokens, currentToken]);
  const selectedDefinition = compatibleTokens.find((token) => token.path === selectedToken) ?? null;

  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-footnote font-medium text-label-primary">{slot.key}</p>
          <p className="mt-0.5 text-caption text-label-secondary">{slot.valueType}</p>
        </div>
        {currentToken ? <BaseTag>{t("CREATION_EDITOR_DESIGN_OVERRIDE_ACTIVE")}</BaseTag> : null}
      </div>
      {compatibleTokens.length > 0 ? (
        <>
          <Select value={selectedToken} onValueChange={setSelectedToken} disabled={disabled}>
            <SelectTrigger
              className="mt-3 w-full"
              aria-label={t("CREATION_EDITOR_DESIGN_TOKEN_LABEL", { slot: slot.key })}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {compatibleTokens.map((token) => (
                <SelectItem key={token.path} value={token.path}>
                  {token.path}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedDefinition ? <TokenEvidence token={selectedDefinition} /> : null}
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              size="sm"
              className="min-h-11 flex-1"
              disabled={disabled || !selectedToken}
              title={disabledReason ?? undefined}
              onClick={() =>
                onPreview([
                  buildSetOperation({
                    page,
                    sectionId: section.id,
                    stateKey,
                    styleSlotKey: slot.key,
                    tokenPath: selectedToken,
                    breakpoint,
                  }),
                ])
              }
            >
              {t("CREATION_EDITOR_DESIGN_PREVIEW_STYLE")}
            </Button>
            {currentToken ? (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="min-h-11 min-w-11"
                disabled={disabled}
                title={t("CREATION_EDITOR_DESIGN_CLEAR_STYLE", { slot: slot.key })}
                aria-label={t("CREATION_EDITOR_DESIGN_CLEAR_STYLE", { slot: slot.key })}
                onClick={() =>
                  onPreview([
                    buildClearOperation({
                      page,
                      sectionId: section.id,
                      stateKey,
                      styleSlotKey: slot.key,
                      breakpoint,
                    }),
                  ])
                }
              >
                <RotateCcw className="size-4" aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        </>
      ) : (
        <p className="mt-3 text-caption leading-5 text-negative">
          {t("CREATION_EDITOR_DESIGN_TOKEN_EMPTY", { type: slot.valueType })}
        </p>
      )}
    </div>
  );
}

function buildSetOperation({
  page,
  sectionId,
  stateKey,
  styleSlotKey,
  tokenPath,
  breakpoint,
}: {
  page: BuilderRevisionPageOut;
  sectionId: string;
  stateKey: string;
  styleSlotKey: string;
  tokenPath: string;
  breakpoint: string | null;
}): DesignChangeOperation {
  const base = {
    operationId: `design-style-${globalThis.crypto.randomUUID()}`,
    itemId: page.itemId,
    expectedDraftVersion: page.versionNumber,
    sourceWireframeChecksum: page.wireframeChecksum!,
    sectionId,
    stateKey,
    styleSlotKey,
    tokenPath,
  };
  return breakpoint
    ? { ...base, type: "design.responsive_style.set", breakpoint }
    : { ...base, type: "design.style.set" };
}

function buildClearOperation({
  page,
  sectionId,
  stateKey,
  styleSlotKey,
  breakpoint,
}: {
  page: BuilderRevisionPageOut;
  sectionId: string;
  stateKey: string;
  styleSlotKey: string;
  breakpoint: string | null;
}): DesignChangeOperation {
  const base = {
    operationId: `design-clear-${globalThis.crypto.randomUUID()}`,
    itemId: page.itemId,
    expectedDraftVersion: page.versionNumber,
    sourceWireframeChecksum: page.wireframeChecksum!,
    sectionId,
    stateKey,
    styleSlotKey,
  };
  return breakpoint
    ? { ...base, type: "design.responsive_style.clear", breakpoint }
    : { ...base, type: "design.style.clear" };
}

function findBlueprintToken(
  blueprint: VisualBlueprintDocumentV1,
  sectionId: string,
  stateKey: string,
  slotKey: string,
  breakpoint: string | null,
): string | null {
  const section = blueprint.sections?.find((item) => item.sectionId === sectionId);
  const states = breakpoint
    ? section?.responsiveOverrides?.find((item) => item.breakpoint === breakpoint)?.states
    : section?.states;
  return states?.find((item) => item.stateKey === stateKey)?.styleTokens?.[slotKey] ?? null;
}

function TokenEvidence({ token }: { token: BuilderDesignTokenOut }) {
  return (
    <div className="mt-2 flex items-center gap-2 text-caption text-label-secondary">
      {token.type === "color" && typeof token.resolvedValue === "string" ? (
        <span
          className="size-4 shrink-0 rounded-sm border border-border"
          style={{ backgroundColor: token.resolvedValue }}
          aria-hidden="true"
        />
      ) : null}
      <span className="truncate font-mono">{formatTokenValue(token.resolvedValue)}</span>
    </div>
  );
}

function EvidenceValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-caption font-medium text-label-secondary">{label}</dt>
      <dd className="mt-1 break-all font-mono text-footnote text-label-primary">{value}</dd>
    </div>
  );
}

function InspectorEmpty() {
  const { t } = useTranslation("account");
  return (
    <div className="flex min-h-72 flex-col items-center justify-center px-8 py-10 text-center">
      <span className="mb-4 flex size-10 items-center justify-center rounded-lg bg-muted text-label-secondary">
        <Paintbrush className="size-5" aria-hidden="true" />
      </span>
      <h3 className="text-body font-semibold text-label-primary">
        {t("CREATION_EDITOR_DESIGN_INSPECTOR_EMPTY_TITLE")}
      </h3>
      <p className="mt-2 text-footnote leading-5 text-label-secondary">
        {t("CREATION_EDITOR_DESIGN_INSPECTOR_EMPTY_DESC")}
      </p>
    </div>
  );
}

function formatTokenValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "string" || typeof value === "number") return String(value);
  return JSON.stringify(value);
}
