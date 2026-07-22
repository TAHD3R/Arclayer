import { Globe2, Mail, Search, Share2 } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@arclayer/lib/utils";

type SiteSettingsPreviewRailProps = {
  description: string;
  faviconUrl: string;
  indexingAllowed: boolean;
  logoUrl: string;
  mode: "identity" | "discovery";
  publicUrl: string;
  siteContactEmail: string;
  siteName: string;
  siteSubtitle: string;
  socialImageUrl: string;
  title: string;
};

function resolvePublicHost(publicUrl: string): string {
  try {
    return new URL(publicUrl).hostname;
  } catch {
    return publicUrl || "example.com";
  }
}

function PreviewHeader(props: { description: string; eyebrow: string; title: string }) {
  return (
    <header className="border-b border-border px-4 py-4 sm:px-5">
      <div className="flex items-center gap-2 text-caption font-medium text-primary">
        <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
        {props.eyebrow}
      </div>
      <h3 className="mt-2 text-headline font-semibold text-label-primary">{props.title}</h3>
      <p className="mt-1 text-footnote text-label-secondary">{props.description}</p>
    </header>
  );
}

function BrowserFrame(props: {
  children: ReactNode;
  faviconUrl: string;
  publicUrl: string;
  title: string;
}) {
  const { t } = useTranslation(["settings"]);
  const host = resolvePublicHost(props.publicUrl);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
      <div className="flex items-center gap-3 border-b border-border bg-muted/40 px-3 py-2.5">
        <div className="flex shrink-0 gap-1" aria-hidden="true">
          <span className="size-2 rounded-full bg-label-tertiary/30" />
          <span className="size-2 rounded-full bg-label-tertiary/30" />
          <span className="size-2 rounded-full bg-label-tertiary/30" />
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5">
          {props.faviconUrl ? (
            <img
              src={props.faviconUrl}
              alt=""
              width={16}
              height={16}
              className="size-4 shrink-0 rounded-sm object-cover"
            />
          ) : (
            <Globe2 aria-hidden="true" className="size-3.5 shrink-0 text-label-tertiary" />
          )}
          <span className="truncate text-caption text-label-secondary">
            {props.publicUrl ? host : t("settings:SETTINGS_SITE_PREVIEW_ADDRESS_UNAVAILABLE")}
          </span>
        </div>
      </div>
      <div className="border-b border-border px-3 py-2 text-caption text-label-secondary">
        <span className="line-clamp-1">{props.title}</span>
      </div>
      {props.children}
    </div>
  );
}

function SiteIdentityPreview(props: SiteSettingsPreviewRailProps) {
  const { t } = useTranslation(["settings"]);
  const siteName = props.siteName || t("settings:SETTINGS_SITE_PREVIEW_UNNAMED_SITE");

  return (
    <BrowserFrame faviconUrl={props.faviconUrl} publicUrl={props.publicUrl} title={siteName}>
      <div className="min-h-72 bg-card px-5 py-7">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-muted">
            {props.logoUrl ? (
              <img
                src={props.logoUrl}
                alt=""
                width={40}
                height={40}
                className="size-full object-cover"
              />
            ) : (
              <span className="text-headline font-semibold text-label-secondary">
                {siteName.slice(0, 1).toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0 pt-0.5">
            <div className="line-clamp-2 text-title3 font-semibold text-label-primary">
              {siteName}
            </div>
            {props.siteSubtitle ? (
              <div className="mt-1 line-clamp-2 text-footnote text-label-secondary">
                {props.siteSubtitle}
              </div>
            ) : null}
          </div>
        </div>
        <div className="mt-8 max-w-sm">
          <div className="text-title2 font-semibold tracking-tight text-label-primary">
            {siteName}
          </div>
          <p className="mt-3 line-clamp-4 text-body leading-6 text-label-secondary">
            {props.description || t("settings:SETTINGS_SITE_DISCOVERY_EMPTY_DESCRIPTION")}
          </p>
        </div>
        <div className="mt-8 border-t border-border pt-4">
          <div className="flex items-center gap-2 text-caption text-label-secondary">
            <Mail aria-hidden="true" className="size-3.5" />
            <span className="truncate">
              {props.siteContactEmail || t("settings:SETTINGS_SITE_PREVIEW_SUPPORT_UNAVAILABLE")}
            </span>
          </div>
        </div>
      </div>
    </BrowserFrame>
  );
}

function SearchResultPreview(props: SiteSettingsPreviewRailProps) {
  const { t } = useTranslation(["settings"]);
  const host = resolvePublicHost(props.publicUrl);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-caption text-label-secondary">
        <Search aria-hidden="true" className="size-4" />
        <span>{t("settings:SETTINGS_SITE_DISCOVERY_SEARCH_LABEL")}</span>
      </div>
      <div className="mt-4 flex items-start gap-3">
        <div className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-full bg-muted">
          {props.faviconUrl ? (
            <img
              src={props.faviconUrl}
              alt=""
              width={32}
              height={32}
              className="size-full object-cover"
            />
          ) : (
            <Globe2 aria-hidden="true" className="size-4 text-label-secondary" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-footnote text-label-secondary">{host}</div>
          <div className="mt-1 line-clamp-2 text-title3 font-medium text-primary">
            {props.title}
          </div>
          <div className="mt-1 line-clamp-3 text-callout text-label-secondary">
            {props.indexingAllowed
              ? props.description || t("settings:SETTINGS_SITE_DISCOVERY_EMPTY_DESCRIPTION")
              : t("settings:SETTINGS_SITE_DISCOVERY_NOINDEX")}
          </div>
        </div>
      </div>
    </div>
  );
}

function SocialPreview(props: SiteSettingsPreviewRailProps) {
  const { t } = useTranslation(["settings"]);
  const siteName = props.siteName || t("settings:SETTINGS_SITE_PREVIEW_UNNAMED_SITE");

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="grid aspect-[1.91/1] place-items-center bg-muted">
        {props.socialImageUrl ? (
          <img
            src={props.socialImageUrl}
            alt=""
            width={720}
            height={377}
            className="size-full object-cover"
          />
        ) : (
          <Share2 aria-hidden="true" className="size-8 text-label-secondary" />
        )}
      </div>
      <div className="flex flex-col gap-1 p-4">
        <div className="truncate text-caption uppercase text-label-tertiary">
          {props.publicUrl || t("settings:SETTINGS_NOT_SET")}
        </div>
        <div className="line-clamp-2 text-headline font-semibold text-label-primary">
          {siteName}
        </div>
        <div className="line-clamp-2 text-callout text-label-secondary">
          {props.description || t("settings:SETTINGS_SITE_DISCOVERY_EMPTY_DESCRIPTION")}
        </div>
      </div>
    </div>
  );
}

export function SiteSettingsPreviewRail(props: SiteSettingsPreviewRailProps) {
  const { t } = useTranslation(["settings"]);
  const identityMode = props.mode === "identity";

  return (
    <aside
      aria-label={t("settings:SETTINGS_SITE_PREVIEW_EYEBROW")}
      data-testid={`website-${props.mode}-preview`}
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-muted/15",
        "xl:sticky xl:top-[calc(var(--page-sticky-header-height,0px)+1.5rem)] xl:self-start",
      )}
    >
      <PreviewHeader
        eyebrow={t("settings:SETTINGS_SITE_PREVIEW_EYEBROW")}
        title={t(
          identityMode
            ? "settings:SETTINGS_SITE_PREVIEW_IDENTITY_TITLE"
            : "settings:SETTINGS_SITE_PREVIEW_DISCOVERY_TITLE",
        )}
        description={t("settings:SETTINGS_SITE_PREVIEW_DESC")}
      />
      <div className="grid gap-4 p-4 sm:p-5">
        {identityMode ? (
          <SiteIdentityPreview {...props} />
        ) : (
          <>
            <SearchResultPreview {...props} />
            <SocialPreview {...props} />
          </>
        )}
      </div>
    </aside>
  );
}
