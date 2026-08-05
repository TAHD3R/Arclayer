import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { DesignSystemManifestV1 } from "@arclayer/openapi";

const PALETTE_PATHS = [
  "primitive.color.canvas",
  "primitive.color.ink",
  "primitive.color.muted",
  "primitive.color.action",
  "primitive.color.on-action",
  "primitive.color.border",
  "primitive.color.focus",
] as const;

export function StyleGuideFoundationPreview({
  manifest,
  candidate,
}: {
  manifest: DesignSystemManifestV1;
  candidate: boolean;
}) {
  const { t } = useTranslation("account");
  const palette = useMemo(
    () =>
      PALETTE_PATHS.map((path) => ({ path, value: tokenString(manifest, path) })).filter(
        (token): token is { path: (typeof PALETTE_PATHS)[number]; value: string } =>
          token.value !== null,
      ),
    [manifest],
  );
  const font = tokenString(manifest, "primitive.font.family.body");
  const size = tokenString(manifest, "primitive.font.size.body");
  const motion = tokenString(manifest, "primitive.motion.duration.standard");
  return (
    <div className="pt-7">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-title3 font-semibold text-label-primary">
            {t("CREATION_EDITOR_STYLE_PALETTE_TITLE")}
          </h2>
          <p className="mt-1 text-footnote text-label-secondary">
            {candidate
              ? t("CREATION_EDITOR_STYLE_CANDIDATE_CANVAS_DESC")
              : t("CREATION_EDITOR_STYLE_CURRENT_CANVAS_DESC")}
          </p>
        </div>
        <span className="text-caption font-medium text-primary">
          {candidate
            ? t("CREATION_EDITOR_STYLE_SERVER_CANDIDATE")
            : t("CREATION_EDITOR_STYLE_CURRENT_VERSION")}
        </span>
      </div>
      {palette.length ? (
        <div className="mt-4 grid overflow-hidden rounded-lg border border-border sm:grid-cols-7">
          {palette.map((token) => (
            <div key={token.path} className="min-w-0 bg-card">
              <div
                className="h-24 border-b border-border"
                style={{ backgroundColor: token.value }}
              />
              <div className="px-3 py-2">
                <p className="truncate font-mono text-caption text-label-secondary">
                  {token.path.split(".").at(-1)}
                </p>
                <p className="mt-1 font-mono text-caption text-label-primary tabular-nums">
                  {token.value}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 flex min-h-24 items-center justify-center rounded-lg border border-dashed border-border bg-card/60 px-6 py-8 text-center">
          <p className="max-w-lg text-footnote leading-5 text-label-secondary">
            {t("CREATION_EDITOR_STYLE_PALETTE_EMPTY")}
          </p>
        </div>
      )}
      <div className="mt-8 grid gap-8 border-t border-border pt-7 lg:grid-cols-[minmax(0,1.5fr)_minmax(16rem,0.8fr)]">
        <div>
          <h2 className="text-title3 font-semibold text-label-primary">
            {t("CREATION_EDITOR_STYLE_TYPE_TITLE")}
          </h2>
          <p
            className="mt-4 text-title1 font-semibold tracking-tight text-label-primary"
            style={font ? { fontFamily: font } : undefined}
          >
            {t("CREATION_EDITOR_STYLE_TYPE_SAMPLE")}
          </p>
          <p
            className="mt-3 max-w-2xl text-body text-label-secondary"
            style={font ? { fontFamily: font } : undefined}
          >
            {t("CREATION_EDITOR_STYLE_TYPE_BODY_SAMPLE")}
          </p>
        </div>
        <dl className="grid content-start gap-3 border-l border-border pl-5 text-footnote">
          <TokenEvidence label={t("CREATION_EDITOR_STYLE_FONT_FAMILY")} value={font} />
          <TokenEvidence label={t("CREATION_EDITOR_STYLE_BASE_SIZE")} value={size} />
          <TokenEvidence label={t("CREATION_EDITOR_STYLE_MOTION")} value={motion} />
          <TokenEvidence
            label={t("CREATION_EDITOR_STYLE_COMPONENT_CATALOG")}
            value={manifest.componentCatalogVersion}
          />
        </dl>
      </div>
    </div>
  );
}

function TokenEvidence({ label, value }: { label: string; value: string | null | undefined }) {
  const { t } = useTranslation("account");
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-label-secondary">{label}</dt>
      <dd className="max-w-44 break-words text-right font-mono text-label-primary tabular-nums">
        {value ?? t("CREATION_EDITOR_STYLE_TOKEN_MISSING")}
      </dd>
    </div>
  );
}

function tokenString(manifest: DesignSystemManifestV1, path: string): string | null {
  const value = manifest.primitiveTokens?.[path]?.value;
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value.join(", ");
  }
  return value === undefined || value === null ? null : String(value);
}
