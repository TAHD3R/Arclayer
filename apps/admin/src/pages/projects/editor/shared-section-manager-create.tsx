import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { BuilderChangeSetPreviewOut, BuilderRevisionOut } from "@arclayer/openapi";
import { Input } from "@arclayer/ui/input";
import { NativeSelect, NativeSelectOption } from "@arclayer/ui/native-select";
import { Textarea } from "@arclayer/ui/textarea";

import { SharedSectionIssueList } from "@/pages/projects/editor/shared-section-manager-elements";
import type { SharedSectionCreateDraft } from "@/pages/projects/editor/use-shared-section-manager";

interface SharedSectionCreateFormProps {
  revision: BuilderRevisionOut;
  draft: SharedSectionCreateDraft;
  submitted: boolean;
  defaultPropsInvalid: boolean;
  preview: BuilderChangeSetPreviewOut | null;
  onChange: (patch: Partial<SharedSectionCreateDraft>) => void;
}

export function SharedSectionCreateForm({
  revision,
  draft,
  submitted,
  defaultPropsInvalid,
  preview,
  onChange,
}: SharedSectionCreateFormProps) {
  const { t } = useTranslation(["account", "errors"]);
  const normalized = preview?.operations.find(
    (operation) => operation.type === "global_section.create",
  );
  const titleInvalid = submitted && !draft.title.trim();
  const slugInvalid = submitted && !draft.slug.trim();
  const localeInvalid = submitted && !draft.locale;
  const propsInvalid = submitted && defaultPropsInvalid;
  return (
    <div className="grid gap-6 px-6 py-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="grid min-w-0 gap-5">
        <LabeledField
          id="builder-global-section-title"
          label={t("CREATION_EDITOR_SHARED_SECTIONS_NAME")}
          error={titleInvalid ? t("CREATION_EDITOR_SHARED_SECTIONS_REQUIRED") : null}
        >
          <Input
            id="builder-global-section-title"
            autoFocus
            name="global-section-title"
            value={draft.title}
            aria-invalid={titleInvalid}
            aria-describedby={titleInvalid ? "builder-global-section-title-error" : undefined}
            onChange={(event) => onChange({ title: event.target.value })}
            placeholder={t("CREATION_EDITOR_SHARED_SECTIONS_NAME_PLACEHOLDER")}
          />
        </LabeledField>
        <LabeledField
          id="builder-global-section-key"
          label={t("CREATION_EDITOR_SHARED_SECTIONS_KEY")}
          hint={t("CREATION_EDITOR_SHARED_SECTIONS_KEY_HINT")}
          error={slugInvalid ? t("CREATION_EDITOR_SHARED_SECTIONS_REQUIRED") : null}
        >
          <Input
            id="builder-global-section-key"
            name="global-section-key"
            value={draft.slug}
            aria-invalid={slugInvalid}
            aria-describedby={
              slugInvalid
                ? "builder-global-section-key-hint builder-global-section-key-error"
                : "builder-global-section-key-hint"
            }
            onChange={(event) => onChange({ slug: event.target.value })}
            placeholder="announcement-bar"
            className="font-mono"
          />
        </LabeledField>
        <LabeledField
          id="builder-global-section-locale"
          label={t("CREATION_EDITOR_SHARED_SECTIONS_LOCALE")}
          error={localeInvalid ? t("CREATION_EDITOR_SHARED_SECTIONS_LOCALE_REQUIRED") : null}
        >
          <NativeSelect
            id="builder-global-section-locale"
            name="global-section-locale"
            value={draft.locale}
            aria-invalid={localeInvalid}
            aria-describedby={localeInvalid ? "builder-global-section-locale-error" : undefined}
            onChange={(event) => onChange({ locale: event.target.value })}
            className="w-full"
          >
            {revision.contentStructureRevision.snapshot.locales.map((locale) => (
              <NativeSelectOption key={locale} value={locale}>
                {locale}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </LabeledField>
        <LabeledField
          id="builder-global-section-purpose"
          label={t("CREATION_EDITOR_SHARED_SECTIONS_PURPOSE")}
          hint={t("CREATION_EDITOR_SHARED_SECTIONS_PURPOSE_HINT")}
        >
          <Textarea
            id="builder-global-section-purpose"
            name="global-section-purpose"
            value={draft.purpose}
            aria-describedby="builder-global-section-purpose-hint"
            onChange={(event) => onChange({ purpose: event.target.value })}
            className="min-h-24 resize-y"
          />
        </LabeledField>
        <LabeledField
          id="builder-global-section-default-props"
          label={t("CREATION_EDITOR_SHARED_SECTIONS_DEFAULT_PROPS")}
          hint={t("CREATION_EDITOR_SHARED_SECTIONS_DEFAULT_PROPS_HINT")}
          error={propsInvalid ? t("CREATION_EDITOR_SHARED_SECTIONS_DEFAULT_PROPS_INVALID") : null}
        >
          <Textarea
            id="builder-global-section-default-props"
            name="global-section-default-props"
            value={draft.defaultProps}
            aria-invalid={propsInvalid}
            aria-describedby={
              propsInvalid
                ? "builder-global-section-default-props-hint builder-global-section-default-props-error"
                : "builder-global-section-default-props-hint"
            }
            onChange={(event) => onChange({ defaultProps: event.target.value })}
            placeholder={'{"tone":"quiet"}'}
            className="min-h-24 resize-y font-mono text-caption"
          />
        </LabeledField>
      </div>
      <PreviewEvidence preview={preview} normalized={normalized} />
    </div>
  );
}

function LabeledField({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-footnote font-medium text-label-primary">
        {label}
      </label>
      {hint ? (
        <p id={`${id}-hint`} className="text-caption text-label-secondary">
          {hint}
        </p>
      ) : null}
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-caption text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function PreviewEvidence({
  preview,
  normalized,
}: {
  preview: BuilderChangeSetPreviewOut | null;
  normalized?: Extract<
    BuilderChangeSetPreviewOut["operations"][number],
    { type: "global_section.create" }
  >;
}) {
  const { t } = useTranslation(["account", "errors"]);
  if (!preview || !normalized) {
    return (
      <aside className="rounded-lg border border-border bg-muted/25 p-4">
        <p className="text-footnote font-semibold text-label-primary">
          {t("CREATION_EDITOR_SHARED_SECTIONS_PREVIEW_TITLE")}
        </p>
        <p className="mt-2 text-caption leading-5 text-label-secondary">
          {t("CREATION_EDITOR_SHARED_SECTIONS_PREVIEW_PENDING")}
        </p>
      </aside>
    );
  }
  return (
    <aside className="rounded-lg border border-border bg-muted/25 p-4" aria-live="polite">
      <div className="flex items-center gap-2 text-footnote font-semibold text-label-primary">
        <Check className="size-4 text-positive" aria-hidden="true" />
        {t("CREATION_EDITOR_SHARED_SECTIONS_PREVIEW_READY")}
      </div>
      <dl className="mt-4 grid gap-3 text-caption">
        <EvidenceRow label={t("CREATION_EDITOR_SHARED_SECTIONS_NAME")} value={normalized.title} />
        <EvidenceRow
          label={t("CREATION_EDITOR_SHARED_SECTIONS_KEY")}
          value={normalized.slug}
          mono
        />
        <EvidenceRow
          label={t("CREATION_EDITOR_SHARED_SECTIONS_LOCALE")}
          value={normalized.locale ?? "—"}
        />
        <EvidenceRow
          label={t("CREATION_EDITOR_SHARED_SECTIONS_AFFECTED_TARGETS")}
          value={String(preview.affectedTargets.length)}
        />
        <EvidenceRow
          label={t("CREATION_EDITOR_SHARED_SECTIONS_PERMISSIONS")}
          value={String(preview.requiredPermissions.length)}
        />
      </dl>
      <SharedSectionIssueList preview={preview} />
    </aside>
  );
}

function EvidenceRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
      <dt className="text-label-secondary">{label}</dt>
      <dd
        className={mono ? "max-w-40 truncate font-mono text-label-primary" : "text-label-primary"}
      >
        {value}
      </dd>
    </div>
  );
}
