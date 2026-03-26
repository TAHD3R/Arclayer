import * as React from "react";
import { useTranslation } from "react-i18next";

import { Input } from "@arclayer/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { Switch } from "@arclayer/ui/switch";

export type ContentLibraryPrototypeViewVisibility = "private" | "workspace";

export type ContentLibraryPrototypeViewDraft = Readonly<{
  name: string;
  visibility: ContentLibraryPrototypeViewVisibility;
  isDefault: boolean;
}>;

export function createContentLibraryPrototypeViewDraft(
  overrides: Partial<ContentLibraryPrototypeViewDraft> = {},
): ContentLibraryPrototypeViewDraft {
  return {
    name: "",
    visibility: "private",
    isDefault: false,
    ...overrides,
  };
}

function buildFieldId(prefix: string, field: string) {
  return `${prefix}-${field}`;
}

export function ContentLibraryViewFormHeader(props: {
  title: React.ReactNode;
  description: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="text-headline text-foreground">{props.title}</div>
      <div className="text-body text-label-secondary">{props.description}</div>
    </div>
  );
}

export function ContentLibraryViewFormFields(props: {
  value: ContentLibraryPrototypeViewDraft;
  onChange: (next: ContentLibraryPrototypeViewDraft) => void;
  disabled?: boolean;
  fieldIdPrefix?: string;
  nameInvalid?: boolean;
  nameHint?: React.ReactNode;
}) {
  const { t } = useTranslation("content");
  const fieldIdPrefix = props.fieldIdPrefix ?? "content-library-view";
  const visibilityLabelId = buildFieldId(fieldIdPrefix, "visibility-label");
  const defaultLabelId = buildFieldId(fieldIdPrefix, "default-label");
  const nameFieldId = buildFieldId(fieldIdPrefix, "name");
  const nameHintId = props.nameHint ? buildFieldId(fieldIdPrefix, "name-hint") : undefined;

  return (
    <>
      <div className="grid gap-1.5">
        <label htmlFor={nameFieldId} className="font-semibold text-foreground">
          {t("CONTENT_LIBRARY_VIEW_CREATE_NAME")}
        </label>
        <Input
          id={nameFieldId}
          aria-label={t("CONTENT_LIBRARY_VIEW_CREATE_NAME")}
          aria-invalid={props.nameInvalid || undefined}
          aria-describedby={nameHintId}
          value={props.value.name}
          disabled={props.disabled}
          onChange={(event) => props.onChange({ ...props.value, name: event.target.value })}
          placeholder={t("CONTENT_LIBRARY_VIEW_CREATE_PLACEHOLDER")}
          className="aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40"
        />
        {props.nameHint ? (
          <div id={nameHintId} className="text-callout text-destructive">
            {props.nameHint}
          </div>
        ) : null}
      </div>

      <div className="grid gap-1.5">
        <label id={visibilityLabelId} className="font-semibold text-foreground">
          {t("CONTENT_LIBRARY_VIEW_VISIBILITY_LABEL")}
        </label>
        <div className="text-label-secondary">{t("CONTENT_LIBRARY_VIEW_VISIBILITY_HELP")}</div>
        <Select
          value={props.value.visibility}
          disabled={props.disabled}
          onValueChange={(next) =>
            props.onChange({
              ...props.value,
              visibility: next as ContentLibraryPrototypeViewVisibility,
            })
          }
        >
          <SelectTrigger aria-labelledby={visibilityLabelId} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="start">
            <SelectItem value="private">{t("CONTENT_LIBRARY_VIEW_VISIBILITY_PRIVATE")}</SelectItem>
            <SelectItem value="workspace">
              {t("CONTENT_LIBRARY_VIEW_VISIBILITY_WORKSPACE")}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3 rounded-xl border border-border/70 bg-muted/20 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div id={defaultLabelId} className="font-semibold text-foreground">
              {t("CONTENT_LIBRARY_VIEW_DEFAULT_LABEL")}
            </div>
            <div className="text-label-secondary">
              {t(
                props.value.isDefault
                  ? "CONTENT_LIBRARY_VIEW_DEFAULT_STATE_ENABLED"
                  : "CONTENT_LIBRARY_VIEW_DEFAULT_STATE_DISABLED",
              )}
            </div>
          </div>
          <Switch
            aria-labelledby={defaultLabelId}
            checked={props.value.isDefault}
            disabled={props.disabled}
            onCheckedChange={(isDefault) => props.onChange({ ...props.value, isDefault })}
          />
        </div>
      </div>
    </>
  );
}
