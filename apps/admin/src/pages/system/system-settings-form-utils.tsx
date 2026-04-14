import type { ReactNode } from "react";

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
    <div className="space-y-2">
      <div className="text-footnote font-medium text-label-primary">{props.label}</div>
      {props.children}
      {props.description ? (
        <div className="text-footnote text-label-secondary">{props.description}</div>
      ) : null}
      <FieldMessage message={props.message} />
    </div>
  );
}
