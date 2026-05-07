import type { ReactNode } from "react";

import { Checkbox } from "@arclayer/ui/checkbox";
import { SettingDialogField } from "@arclayer/ui/setting-dialog-field";
import { Switch } from "@arclayer/ui/switch";

export function normalizeOptionalString(value: string | null | undefined): string | null {
  const normalized = String(value || "").trim();
  return normalized || null;
}

export function formatSummaryText(value: string | null | undefined, fallback = "-"): string {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

export function joinSummaryParts(
  values: Array<string | null | undefined | false>,
  fallback = "-",
): string {
  const parts = values
    .map((value) => String(value || "").trim())
    .filter((value) => value.length > 0);
  return parts.length > 0 ? parts.join(" · ") : fallback;
}

export function splitLineList(value: string | null | undefined): string[] {
  return String(value || "")
    .split(/\r?\n/)
    .map((item) => item.trim().toLowerCase().replace(/^\./, ""))
    .filter((item, index, array) => item.length > 0 && array.indexOf(item) === index);
}

export function joinLineList(values: readonly string[] | null | undefined): string {
  return (values || [])
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join("\n");
}

export function isValidHttpUrl(value: string | null | undefined): boolean {
  const raw = String(value || "").trim();
  if (!raw) return true;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function FieldMessage(props: { message?: string | null }) {
  if (!props.message) return null;
  return <div className="text-footnote text-destructive">{props.message}</div>;
}

export function OverlayField(props: {
  label: ReactNode;
  children: ReactNode;
  description?: ReactNode;
  message?: string | null;
}) {
  return (
    <SettingDialogField
      title={props.label}
      description={props.description}
      error={props.message ? <FieldMessage message={props.message} /> : null}
    >
      {props.children}
    </SettingDialogField>
  );
}

export function OverlayBooleanField(props: {
  label: ReactNode;
  description?: ReactNode;
  message?: string | null;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  variant?: "switch" | "checkbox";
  stateLabel?: ReactNode;
}) {
  const variant = props.variant ?? "switch";

  return (
    <OverlayField label={props.label} description={props.description} message={props.message}>
      <div className="flex w-full items-center gap-3">
        {variant === "switch" ? (
          <Switch
            checked={props.checked}
            disabled={props.disabled}
            onCheckedChange={props.onCheckedChange}
          />
        ) : (
          <Checkbox
            checked={props.checked}
            disabled={props.disabled}
            onCheckedChange={(checked) => props.onCheckedChange(Boolean(checked))}
          />
        )}
        {props.stateLabel ? <div className="text-label-secondary">{props.stateLabel}</div> : null}
      </div>
    </OverlayField>
  );
}
