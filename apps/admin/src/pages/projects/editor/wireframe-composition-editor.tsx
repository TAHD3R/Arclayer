import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { Textarea } from "@arclayer/ui/textarea";
import type {
  BuilderRevisionPageOut,
  ComponentCatalogComponentV1,
  ComponentCatalogSlotV1,
  WireframeSectionV1Output,
} from "@arclayer/openapi";
import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import {
  createBindingDrafts,
  emptyDraft,
  parseBindings,
  type BindingDraft,
  type BindingKind,
  type CompositionError,
} from "@/pages/projects/editor/wireframe-composition-draft";
import type { WireframeChangeOperation } from "@/pages/projects/editor/use-project-editor-controller";

interface WireframeCompositionEditorProps {
  page: BuilderRevisionPageOut;
  section: WireframeSectionV1Output;
  components: ComponentCatalogComponentV1[];
  disabled: boolean;
  onPreview: (operations: WireframeChangeOperation[]) => void;
}

export function WireframeCompositionEditor(props: WireframeCompositionEditorProps) {
  const { t } = useTranslation("account");
  const id = useId();
  const [componentKey, setComponentKey] = useState(props.section.componentKey);
  const [variantKey, setVariantKey] = useState(props.section.variantKey);
  const selectedComponent = useMemo(
    () => props.components.find((component) => component.key === componentKey) ?? null,
    [componentKey, props.components],
  );
  const selectedVariant =
    selectedComponent?.variants.find((variant) => variant.key === variantKey) ?? null;
  const [bindingDrafts, setBindingDrafts] = useState<Record<string, BindingDraft>>(() =>
    createBindingDrafts(props.section, selectedComponent),
  );
  const [error, setError] = useState<CompositionError | null>(null);

  useEffect(() => {
    const component =
      props.components.find((candidate) => candidate.key === props.section.componentKey) ?? null;
    setComponentKey(props.section.componentKey);
    setVariantKey(props.section.variantKey);
    setBindingDrafts(createBindingDrafts(props.section, component));
    setError(null);
  }, [props.components, props.section]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedComponent || !selectedVariant) return;
    const parsed = parseBindings({
      component: selectedComponent,
      requiredSlotKeys: new Set(selectedVariant.requiredSlotKeys ?? []),
      drafts: bindingDrafts,
    });
    if (parsed.error) {
      setError(parsed.error);
      if (parsed.error.slotKey)
        document.getElementById(slotValueId(id, parsed.error.slotKey))?.focus();
      return;
    }
    setError(null);
    props.onPreview([
      {
        type: "wireframe.section.configure",
        operationId: globalThis.crypto.randomUUID(),
        itemId: props.page.itemId,
        expectedDraftVersion: props.page.versionNumber,
        sectionId: props.section.id,
        componentKey,
        variantKey,
        bindings: parsed.bindings,
        responsiveRules: props.section.responsiveRules ?? [],
        interactionRules: props.section.interactionRules ?? [],
      },
    ]);
  };

  return (
    <form className="mt-4 space-y-4" onSubmit={submit}>
      <p className="text-caption leading-5 text-label-secondary">
        {t("CREATION_EDITOR_WIREFRAME_COMPOSITION_DESC")}
      </p>
      <CatalogSelects
        id={id}
        components={props.components}
        componentKey={componentKey}
        variantKey={variantKey}
        selectedComponent={selectedComponent}
        disabled={props.disabled}
        onComponentChange={(value) => {
          const component = props.components.find((candidate) => candidate.key === value) ?? null;
          setComponentKey(value);
          setVariantKey(component?.variants[0]?.key ?? "");
          setBindingDrafts(createBindingDrafts(props.section, component));
          setError(null);
        }}
        onVariantChange={(value) => {
          setVariantKey(value);
          setError(null);
        }}
      />
      {selectedComponent && selectedVariant ? (
        <div className="space-y-3 border-t border-border pt-4">
          <div>
            <h4 className="text-footnote font-semibold text-label-primary">
              {t("CREATION_EDITOR_WIREFRAME_DECLARED_SLOTS")}
            </h4>
            <p className="mt-1 text-caption leading-5 text-label-secondary">
              {t("CREATION_EDITOR_WIREFRAME_DECLARED_SLOTS_DESC")}
            </p>
          </div>
          {(selectedComponent.slots ?? []).map((slot) => (
            <SlotBindingField
              key={slot.key}
              id={id}
              slot={slot}
              required={
                slot.required || (selectedVariant.requiredSlotKeys ?? []).includes(slot.key)
              }
              draft={bindingDrafts[slot.key] ?? emptyDraft(slot)}
              disabled={props.disabled}
              invalid={error?.slotKey === slot.key}
              onChange={(draft) => {
                setBindingDrafts((current) => ({ ...current, [slot.key]: draft }));
                if (error?.slotKey === slot.key) setError(null);
              }}
            />
          ))}
        </div>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-caption text-negative" role="alert">
          {t(error.messageKey)}
        </p>
      ) : null}
      <Button
        type="submit"
        variant="secondary"
        className="min-h-11 w-full"
        disabled={props.disabled || !selectedComponent || !selectedVariant}
        aria-describedby={error ? `${id}-error` : undefined}
      >
        {t("CREATION_EDITOR_WIREFRAME_PREVIEW_COMPOSITION")}
      </Button>
    </form>
  );
}

function CatalogSelects(props: {
  id: string;
  components: ComponentCatalogComponentV1[];
  componentKey: string;
  variantKey: string;
  selectedComponent: ComponentCatalogComponentV1 | null;
  disabled: boolean;
  onComponentChange: (value: string) => void;
  onVariantChange: (value: string) => void;
}) {
  const { t } = useTranslation("account");
  return (
    <div className="space-y-3">
      <SelectFieldLabel
        id={`${props.id}-component`}
        label={t("CREATION_EDITOR_WIREFRAME_COMPONENT")}
      />
      <Select
        value={props.componentKey}
        disabled={props.disabled}
        onValueChange={props.onComponentChange}
      >
        <SelectTrigger id={`${props.id}-component`} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {props.components.map((component) => (
            <SelectItem key={component.key} value={component.key}>
              {localizedText(component.labelByLocale)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <SelectFieldLabel id={`${props.id}-variant`} label={t("CREATION_EDITOR_WIREFRAME_VARIANT")} />
      <Select
        value={props.variantKey}
        disabled={props.disabled || !props.selectedComponent}
        onValueChange={props.onVariantChange}
      >
        <SelectTrigger id={`${props.id}-variant`} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(props.selectedComponent?.variants ?? []).map((variant) => (
            <SelectItem key={variant.key} value={variant.key}>
              {localizedText(variant.labelByLocale)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {props.selectedComponent ? (
        <p className="text-caption leading-5 text-label-secondary">
          {t("CREATION_EDITOR_WIREFRAME_COMPONENT_CONTRACT", {
            slots: props.selectedComponent.slots?.length ?? 0,
            variants: props.selectedComponent.variants.length,
          })}
        </p>
      ) : null}
    </div>
  );
}

function SlotBindingField(props: {
  id: string;
  slot: ComponentCatalogSlotV1;
  required: boolean;
  draft: BindingDraft;
  disabled: boolean;
  invalid: boolean;
  onChange: (draft: BindingDraft) => void;
}) {
  const { t } = useTranslation("account");
  const label = localizedText(props.slot.labelByLocale);
  const valueId = slotValueId(props.id, props.slot.key);
  const hintId = `${valueId}-hint`;
  const kindLabel = `${label} ${t("CREATION_EDITOR_WIREFRAME_BINDING_KIND")}`;
  const valueLabel = `${label} ${t("CREATION_EDITOR_WIREFRAME_BINDING_VALUE")}`;
  const literalIsStructured = ["list", "action", "link", "image"].includes(props.slot.valueKind);
  return (
    <fieldset className="space-y-2 border-t border-border/70 pt-3 first:border-t-0 first:pt-0">
      <legend className="w-full text-caption font-medium text-label-primary">
        {label}
        <span className="ml-2 font-mono text-label-tertiary">{props.slot.key}</span>
        <span className="ml-2 text-label-secondary">
          {props.required
            ? t("CREATION_EDITOR_WIREFRAME_SLOT_REQUIRED")
            : t("CREATION_EDITOR_WIREFRAME_SLOT_OPTIONAL")}
        </span>
      </legend>
      <p id={hintId} className="text-caption leading-5 text-label-secondary">
        {localizedText(props.slot.descriptionByLocale)} · {props.slot.valueKind}
      </p>
      <label htmlFor={`${valueId}-kind`} className="sr-only">
        {kindLabel}
      </label>
      <Select
        value={props.draft.kind}
        disabled={props.disabled}
        onValueChange={(kind) => props.onChange({ kind: kind as BindingKind, value: "" })}
      >
        <SelectTrigger id={`${valueId}-kind`} className="w-full" aria-label={kindLabel}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {!props.required ? (
            <SelectItem value="none">{t("CREATION_EDITOR_WIREFRAME_BINDING_NONE")}</SelectItem>
          ) : null}
          {props.slot.acceptedBindingKinds.map((kind) => (
            <SelectItem key={kind} value={kind}>
              {t(
                kind === "field"
                  ? "CREATION_EDITOR_WIREFRAME_BINDING_FIELD"
                  : "CREATION_EDITOR_WIREFRAME_BINDING_LITERAL",
              )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {props.draft.kind !== "none" ? (
        <>
          <label htmlFor={valueId} className="sr-only">
            {valueLabel}
          </label>
          {props.draft.kind === "literal" && literalIsStructured ? (
            <Textarea
              id={valueId}
              name={`wireframe-slot-${props.slot.key}`}
              className="min-h-24 font-mono text-caption"
              value={props.draft.value}
              disabled={props.disabled}
              aria-label={valueLabel}
              aria-describedby={hintId}
              aria-invalid={props.invalid}
              onChange={(event) => props.onChange({ ...props.draft, value: event.target.value })}
            />
          ) : (
            <Input
              id={valueId}
              name={`wireframe-slot-${props.slot.key}`}
              value={props.draft.value}
              disabled={props.disabled}
              aria-label={valueLabel}
              aria-describedby={hintId}
              aria-invalid={props.invalid}
              onChange={(event) => props.onChange({ ...props.draft, value: event.target.value })}
            />
          )}
        </>
      ) : null}
    </fieldset>
  );
}

function SelectFieldLabel({ id, label }: { id: string; label: string }) {
  return (
    <label htmlFor={id} className="block text-caption font-medium text-label-secondary">
      {label}
    </label>
  );
}

function slotValueId(id: string, slotKey: string): string {
  return `${id}-slot-${slotKey.replaceAll(".", "-")}`;
}

function localizedText(values: Record<string, string>): string {
  const locale = document.documentElement.lang === "zh-CN" ? "zh-CN" : "en-US";
  return values[locale] ?? values["en-US"] ?? Object.values(values)[0] ?? "";
}
