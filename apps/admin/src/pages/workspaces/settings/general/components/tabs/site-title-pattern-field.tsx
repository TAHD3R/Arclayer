import { useEffect, useMemo, useState } from "react";
import type { TitlePolicyV1 } from "@celestial/internal-types";
import { useTranslation } from "react-i18next";

import { Button } from "@celestial/ui/button";
import { Input } from "@celestial/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@celestial/ui/select";
import { cn } from "@celestial/lib/utils";
import { SettingSwitchBlock } from "@/components/settings/setting-switch-block";

type TitlePatternPreset = "page-site" | "site-page" | "page-site-tagline" | "site-only";

const PRESET_OPTIONS: Array<{ value: TitlePatternPreset; labelKey: string; descKey: string }> = [
  {
    value: "page-site",
    labelKey: "settings:SETTINGS_SEO_TITLE_FORMAT_PRESET_PAGE_SITE_TITLE",
    descKey: "settings:SETTINGS_SEO_TITLE_FORMAT_PRESET_PAGE_SITE_DESC",
  },
  {
    value: "site-page",
    labelKey: "settings:SETTINGS_SEO_TITLE_FORMAT_PRESET_SITE_PAGE_TITLE",
    descKey: "settings:SETTINGS_SEO_TITLE_FORMAT_PRESET_SITE_PAGE_DESC",
  },
  {
    value: "page-site-tagline",
    labelKey: "settings:SETTINGS_SEO_TITLE_FORMAT_PRESET_PAGE_SITE_TAGLINE_TITLE",
    descKey: "settings:SETTINGS_SEO_TITLE_FORMAT_PRESET_PAGE_SITE_TAGLINE_DESC",
  },
  {
    value: "site-only",
    labelKey: "settings:SETTINGS_SEO_TITLE_FORMAT_PRESET_SITE_ONLY_TITLE",
    descKey: "settings:SETTINGS_SEO_TITLE_FORMAT_PRESET_SITE_ONLY_DESC",
  },
];

function composeParts(preset: TitlePatternPreset, separator: string): TitlePolicyV1["parts"] {
  const literal = { kind: "literal", value: separator } as const;
  if (preset === "site-only") return [{ kind: "token", value: "siteName" }];
  if (preset === "site-page") {
    return [{ kind: "token", value: "siteName" }, literal, { kind: "token", value: "pageTitle" }];
  }
  if (preset === "page-site-tagline") {
    return [
      { kind: "token", value: "pageTitle" },
      literal,
      { kind: "token", value: "siteName" },
      literal,
      { kind: "token", value: "siteSubtitle" },
    ];
  }
  return [{ kind: "token", value: "pageTitle" }, literal, { kind: "token", value: "siteName" }];
}

function detectPreset(policy: TitlePolicyV1): TitlePatternPreset {
  const tokens = policy.parts.filter((part) => part.kind === "token").map((part) => part.value);
  if (tokens.join("|") === "siteName") return "site-only";
  if (tokens.join("|") === "siteName|pageTitle") return "site-page";
  if (tokens.join("|") === "pageTitle|siteName|siteSubtitle") return "page-site-tagline";
  return "page-site";
}

function detectSeparator(policy: TitlePolicyV1): string {
  const literal = policy.parts.find((part) => part.kind === "literal");
  if (!literal) return " - ";
  return literal.value;
}

function buildPreview(args: {
  policy: TitlePolicyV1;
  pageTitle: string;
  siteName: string;
  siteSubtitle: string;
  useHomeMode?: boolean;
}): string {
  const tokenValues = {
    pageTitle: args.pageTitle,
    siteName: args.siteName,
    siteSubtitle: args.siteSubtitle,
  } as const;
  if (args.useHomeMode && (args.policy.homeMode ?? "siteOnly") === "siteOnly") {
    return tokenValues.siteName;
  }
  const pieces = args.policy.parts.map((part) =>
    part.kind === "token" ? (tokenValues[part.value] ?? "") : part.value,
  );
  const composed = pieces.join("").replace(/\s+/g, " ").trim();
  if (
    args.policy.dedupe !== false &&
    composed === `${args.pageTitle}${detectSeparator(args.policy)}${args.siteName}`
  ) {
    return composed;
  }
  return composed;
}

export function SiteTitlePatternField(props: {
  onChange: (next: TitlePolicyV1) => void;
  siteName: string;
  siteSubtitle: string;
  value: TitlePolicyV1;
}) {
  const { t } = useTranslation();
  const preset = useMemo(() => detectPreset(props.value), [props.value]);
  const [separatorDraft, setSeparatorDraft] = useState(() => detectSeparator(props.value));

  useEffect(() => {
    const hasLiteral = props.value.parts.some((part) => part.kind === "literal");
    if (!hasLiteral) return;
    setSeparatorDraft(detectSeparator(props.value));
  }, [props.value]);

  const preview = useMemo(
    () =>
      buildPreview({
        policy: props.value,
        pageTitle: t("settings:SETTINGS_SEO_TITLE_FORMAT_SAMPLE_PAGE_TITLE"),
        siteName: props.siteName || t("settings:SETTINGS_SEO_TITLE_FORMAT_SAMPLE_SITE_NAME"),
        siteSubtitle:
          props.siteSubtitle || t("settings:SETTINGS_SEO_TITLE_FORMAT_SAMPLE_SITE_SUBTITLE"),
        useHomeMode: false,
      }),
    [props.siteName, props.siteSubtitle, props.value, t],
  );
  const homePreview = useMemo(
    () =>
      buildPreview({
        policy: props.value,
        pageTitle: t("settings:SETTINGS_SEO_TITLE_FORMAT_SAMPLE_PAGE_TITLE"),
        siteName: props.siteName || t("settings:SETTINGS_SEO_TITLE_FORMAT_SAMPLE_SITE_NAME"),
        siteSubtitle:
          props.siteSubtitle || t("settings:SETTINGS_SEO_TITLE_FORMAT_SAMPLE_SITE_SUBTITLE"),
        useHomeMode: true,
      }),
    [props.siteName, props.siteSubtitle, props.value, t],
  );

  const updatePolicy = (next: {
    preset?: TitlePatternPreset;
    separator?: string;
    homeMode?: "siteOnly" | "policy";
    dedupe?: boolean;
  }) => {
    const resolvedPreset = next.preset ?? preset;
    const resolvedSeparator = next.separator ?? separatorDraft;
    props.onChange({
      parts: composeParts(resolvedPreset, resolvedSeparator),
      homeMode: next.homeMode ?? props.value.homeMode ?? "siteOnly",
      dedupe: next.dedupe ?? props.value.dedupe ?? true,
    });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
        <div className="text-footnote text-label-secondary">
          {t("settings:SETTINGS_SEO_TITLE_FORMAT_PREVIEW_LABEL")}
        </div>
        <div className="mt-2 text-title3 text-label-primary">{preview || "-"}</div>
        <div className="mt-1 text-caption text-label-secondary">
          {t("settings:SETTINGS_SEO_TITLE_FORMAT_PREVIEW_DESC")}
        </div>
        <div className="mt-3 rounded-lg bg-background/80 px-3 py-2">
          <div className="text-caption text-label-secondary">
            {t("settings:SETTINGS_SEO_TITLE_FORMAT_HOME_MODE")}
          </div>
          <div className="mt-1 text-callout text-label-primary">{homePreview || "-"}</div>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        {PRESET_OPTIONS.map((option) => {
          const isSelected = option.value === preset;
          return (
            <Button
              key={option.value}
              type="button"
              variant="outline"
              aria-pressed={isSelected}
              className={cn(
                "h-auto w-full min-w-0 shrink !whitespace-normal items-start justify-start overflow-hidden rounded-xl border px-4 py-3 text-left shadow-none transition-colors",
                isSelected
                  ? "border-primary/25 bg-primary/8 hover:bg-primary/10"
                  : "border-border/60 bg-background hover:bg-muted/40",
              )}
              onClick={() => updatePolicy({ preset: option.value })}
            >
              <div className="flex w-full min-w-0 flex-col items-start gap-1 overflow-hidden">
                <div className="text-callout text-label-primary">{t(option.labelKey)}</div>
                <div className="max-w-full whitespace-normal text-caption leading-5 [overflow-wrap:anywhere] text-label-secondary/90">
                  {t(option.descKey)}
                </div>
              </div>
            </Button>
          );
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <div className="text-body text-label-primary">
            {t("settings:SETTINGS_SEO_TITLE_FORMAT_SEPARATOR_LABEL")}
          </div>
          <Input
            value={separatorDraft}
            placeholder={t("settings:SETTINGS_SEO_TITLE_FORMAT_LITERAL_PLACEHOLDER")}
            onChange={(event) => {
              const nextSeparator = event.target.value;
              setSeparatorDraft(nextSeparator);
              updatePolicy({ separator: nextSeparator });
            }}
          />
          <div className="text-callout text-label-secondary">
            {t("settings:SETTINGS_SEO_TITLE_FORMAT_SEPARATOR_DESC")}
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-body text-label-primary">
            {t("settings:SETTINGS_SEO_TITLE_FORMAT_HOME_MODE")}
          </div>
          <Select
            value={props.value.homeMode ?? "siteOnly"}
            onValueChange={(next) => {
              if (next !== "siteOnly" && next !== "policy") return;
              updatePolicy({ homeMode: next });
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="start">
              <SelectItem value="siteOnly">
                {t("settings:SETTINGS_SEO_TITLE_FORMAT_HOME_MODE_SITE_ONLY")}
              </SelectItem>
              <SelectItem value="policy">
                {t("settings:SETTINGS_SEO_TITLE_FORMAT_HOME_MODE_POLICY")}
              </SelectItem>
            </SelectContent>
          </Select>
          <div className="text-callout text-label-secondary">
            {t("settings:SETTINGS_SEO_TITLE_FORMAT_HOME_MODE_DESC")}
          </div>
        </div>
      </div>

      <SettingSwitchBlock
        checked={props.value.dedupe !== false}
        label={t("settings:SETTINGS_SEO_TITLE_FORMAT_DEDUPE_TITLE")}
        description={t("settings:SETTINGS_SEO_TITLE_FORMAT_DEDUPE_DESC")}
        onCheckedChange={(checked) => updatePolicy({ dedupe: checked })}
      />
    </div>
  );
}
