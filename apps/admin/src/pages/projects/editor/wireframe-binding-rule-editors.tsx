import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import type { BuilderRevisionPageOut, WireframeSectionV1Output } from "@arclayer/openapi";
import { X } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import type { WireframeChangeOperation } from "@/pages/projects/editor/use-project-editor-controller";

interface WireframeEditorProps {
  page: BuilderRevisionPageOut;
  section: WireframeSectionV1Output;
  disabled: boolean;
  onPreview: (operations: WireframeChangeOperation[]) => void;
}

export function WireframeBindingEditor(props: WireframeEditorProps) {
  const { t } = useTranslation("account");
  const id = useId();
  const [slotKey, setSlotKey] = useState("");
  const [kind, setKind] = useState<"field" | "literal" | "missing">("field");
  const [value, setValue] = useState("");
  const base = operationBase(props);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const slot = slotKey.trim();
    const normalized = value.trim();
    if (!slot || !normalized) return;
    const binding =
      kind === "field"
        ? ({ kind, slotKey: slot, fieldKey: normalized } as const)
        : kind === "literal"
          ? ({ kind, slotKey: slot, value: normalized } as const)
          : ({
              kind,
              slotKey: slot,
              reason: normalized as "content" | "media" | "binding",
            } as const);
    props.onPreview([{ ...base, type: "wireframe.set_binding", binding }]);
  };
  return (
    <section className="mt-5 border-t border-border pt-5" aria-labelledby={`${id}-heading`}>
      <h4 id={`${id}-heading`} className="text-footnote font-semibold text-label-primary">
        {t("CREATION_EDITOR_WIREFRAME_EDIT_BINDING_TITLE")}
      </h4>
      <ul className="mt-3 space-y-2">
        {(props.section.bindings ?? []).map((binding) => (
          <li key={binding.slotKey} className="flex min-h-11 items-center justify-between gap-3">
            <span className="min-w-0 truncate font-mono text-caption text-label-secondary">
              {binding.slotKey} · {binding.kind}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="min-h-11 min-w-11"
              aria-label={t("CREATION_EDITOR_WIREFRAME_CLEAR_BINDING", { slot: binding.slotKey })}
              disabled={props.disabled}
              onClick={() =>
                props.onPreview([
                  { ...base, type: "wireframe.clear_binding", slotKey: binding.slotKey },
                ])
              }
            >
              <X className="size-4" aria-hidden="true" />
            </Button>
          </li>
        ))}
      </ul>
      <form className="mt-3 space-y-3" onSubmit={submit}>
        <FieldLabel htmlFor={`${id}-slot`} label={t("CREATION_EDITOR_WIREFRAME_SLOT_KEY")} />
        <Input
          id={`${id}-slot`}
          name="wireframe-slot-key"
          value={slotKey}
          disabled={props.disabled}
          onChange={(event) => setSlotKey(event.target.value)}
        />
        <FieldLabel htmlFor={`${id}-kind`} label={t("CREATION_EDITOR_WIREFRAME_BINDING_KIND")} />
        <Select
          value={kind}
          disabled={props.disabled}
          onValueChange={(next) => setKind(next as typeof kind)}
        >
          <SelectTrigger id={`${id}-kind`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="field">{t("CREATION_EDITOR_WIREFRAME_BINDING_FIELD")}</SelectItem>
            <SelectItem value="literal">
              {t("CREATION_EDITOR_WIREFRAME_BINDING_LITERAL")}
            </SelectItem>
            <SelectItem value="missing">
              {t("CREATION_EDITOR_WIREFRAME_BINDING_MISSING")}
            </SelectItem>
          </SelectContent>
        </Select>
        <FieldLabel
          htmlFor={`${id}-value`}
          label={t(
            kind === "missing"
              ? "CREATION_EDITOR_WIREFRAME_MISSING_REASON"
              : "CREATION_EDITOR_WIREFRAME_BINDING_VALUE",
          )}
        />
        {kind === "missing" ? (
          <Select value={value} disabled={props.disabled} onValueChange={setValue}>
            <SelectTrigger id={`${id}-value`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="content">
                {t("CREATION_EDITOR_WIREFRAME_MISSING_CONTENT")}
              </SelectItem>
              <SelectItem value="media">{t("CREATION_EDITOR_WIREFRAME_MISSING_MEDIA")}</SelectItem>
              <SelectItem value="binding">
                {t("CREATION_EDITOR_WIREFRAME_MISSING_BINDING")}
              </SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <Input
            id={`${id}-value`}
            name="wireframe-binding-value"
            value={value}
            disabled={props.disabled}
            onChange={(event) => setValue(event.target.value)}
          />
        )}
        <Button
          type="submit"
          variant="secondary"
          className="min-h-11 w-full"
          disabled={props.disabled || !slotKey.trim() || !value.trim()}
        >
          {t("CREATION_EDITOR_WIREFRAME_PREVIEW_BINDING")}
        </Button>
      </form>
    </section>
  );
}

export function WireframeResponsiveEditor(props: WireframeEditorProps) {
  const { t } = useTranslation("account");
  const id = useId();
  const [breakpoint, setBreakpoint] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [layout, setLayout] = useState<"stack" | "grid" | "split" | "overlay">("stack");
  const [columns, setColumns] = useState("1");
  const base = operationBase(props);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    props.onPreview([
      {
        ...base,
        type: "wireframe.set_responsive_rule",
        rule: { breakpoint, layout, columns: Number(columns), visible: true },
      },
    ]);
  };
  return (
    <section className="mt-5 border-t border-border pt-5" aria-labelledby={`${id}-heading`}>
      <h4 id={`${id}-heading`} className="text-footnote font-semibold text-label-primary">
        {t("CREATION_EDITOR_WIREFRAME_EDIT_RESPONSIVE_TITLE")}
      </h4>
      <div className="mt-3 space-y-2">
        {(props.section.responsiveRules ?? []).map((rule) => (
          <div key={rule.breakpoint} className="flex min-h-11 items-center justify-between gap-3">
            <span className="text-caption text-label-secondary">
              {rule.breakpoint} · {rule.layout} · {rule.columns}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="min-h-11 min-w-11"
              aria-label={t("CREATION_EDITOR_WIREFRAME_CLEAR_RESPONSIVE", {
                breakpoint: rule.breakpoint,
              })}
              disabled={props.disabled}
              onClick={() =>
                props.onPreview([
                  { ...base, type: "wireframe.clear_responsive_rule", breakpoint: rule.breakpoint },
                ])
              }
            >
              <X className="size-4" aria-hidden="true" />
            </Button>
          </div>
        ))}
      </div>
      <form className="mt-3 grid grid-cols-2 gap-3" onSubmit={submit}>
        <SelectField
          id={`${id}-breakpoint`}
          label={t("CREATION_EDITOR_WIREFRAME_BREAKPOINT")}
          value={breakpoint}
          disabled={props.disabled}
          onChange={(value) => setBreakpoint(value as typeof breakpoint)}
          options={["desktop", "tablet", "mobile"]}
        />
        <SelectField
          id={`${id}-layout`}
          label={t("CREATION_EDITOR_WIREFRAME_LAYOUT")}
          value={layout}
          disabled={props.disabled}
          onChange={(value) => setLayout(value as typeof layout)}
          options={["stack", "grid", "split", "overlay"]}
        />
        <div className="col-span-2">
          <FieldLabel htmlFor={`${id}-columns`} label={t("CREATION_EDITOR_WIREFRAME_COLUMNS")} />
          <Input
            id={`${id}-columns`}
            name="wireframe-columns"
            type="number"
            inputMode="numeric"
            min={1}
            max={12}
            value={columns}
            disabled={props.disabled}
            onChange={(event) => setColumns(event.target.value)}
          />
        </div>
        <Button
          type="submit"
          variant="secondary"
          className="col-span-2 min-h-11"
          disabled={props.disabled || Number(columns) < 1 || Number(columns) > 12}
        >
          {t("CREATION_EDITOR_WIREFRAME_PREVIEW_RESPONSIVE")}
        </Button>
      </form>
    </section>
  );
}

export function WireframeInteractionEditor(props: WireframeEditorProps) {
  const { t } = useTranslation("account");
  const id = useId();
  const [event, setEvent] = useState<"click" | "submit" | "change" | "hover" | "focus">("click");
  const [action, setAction] = useState<"navigate" | "submit" | "toggle" | "open" | "close">(
    "navigate",
  );
  const [target, setTarget] = useState("");
  const base = operationBase(props);
  const targetRequired = action !== "submit";
  return (
    <section className="mt-5 border-t border-border pt-5" aria-labelledby={`${id}-heading`}>
      <h4 id={`${id}-heading`} className="text-footnote font-semibold text-label-primary">
        {t("CREATION_EDITOR_WIREFRAME_EDIT_INTERACTION_TITLE")}
      </h4>
      <form
        className="mt-3 grid grid-cols-2 gap-3"
        onSubmit={(formEvent) => {
          formEvent.preventDefault();
          props.onPreview([
            {
              ...base,
              type: "wireframe.set_interactions",
              rules: [{ event, action, target: target.trim() || undefined }],
            },
          ]);
        }}
      >
        <SelectField
          id={`${id}-event`}
          label={t("CREATION_EDITOR_WIREFRAME_EVENT")}
          value={event}
          disabled={props.disabled}
          onChange={(value) => setEvent(value as typeof event)}
          options={["click", "submit", "change", "hover", "focus"]}
        />
        <SelectField
          id={`${id}-action`}
          label={t("CREATION_EDITOR_WIREFRAME_ACTION")}
          value={action}
          disabled={props.disabled}
          onChange={(value) => setAction(value as typeof action)}
          options={["navigate", "submit", "toggle", "open", "close"]}
        />
        <div className="col-span-2">
          <FieldLabel htmlFor={`${id}-target`} label={t("CREATION_EDITOR_WIREFRAME_TARGET")} />
          <Input
            id={`${id}-target`}
            name="wireframe-interaction-target"
            value={target}
            disabled={props.disabled}
            required={targetRequired}
            onChange={(inputEvent) => setTarget(inputEvent.target.value)}
          />
        </div>
        <Button
          type="submit"
          variant="secondary"
          className="col-span-2 min-h-11"
          disabled={props.disabled || (targetRequired && !target.trim())}
        >
          {t("CREATION_EDITOR_WIREFRAME_PREVIEW_INTERACTION")}
        </Button>
        {(props.section.interactionRules ?? []).length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            className="col-span-2 min-h-11"
            disabled={props.disabled}
            onClick={() =>
              props.onPreview([{ ...base, type: "wireframe.set_interactions", rules: [] }])
            }
          >
            {t("CREATION_EDITOR_WIREFRAME_CLEAR_INTERACTIONS")}
          </Button>
        ) : null}
      </form>
    </section>
  );
}

function operationBase({ page, section }: WireframeEditorProps) {
  return {
    operationId: globalThis.crypto.randomUUID(),
    itemId: page.itemId,
    expectedDraftVersion: page.versionNumber,
    sectionId: section.id,
  };
}

function FieldLabel({ htmlFor, label }: { htmlFor: string; label: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-caption font-medium text-label-secondary">
      {label}
    </label>
  );
}

function SelectField({
  id,
  label,
  value,
  disabled,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <div>
      <FieldLabel htmlFor={id} label={label} />
      <Select value={value} disabled={disabled} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
