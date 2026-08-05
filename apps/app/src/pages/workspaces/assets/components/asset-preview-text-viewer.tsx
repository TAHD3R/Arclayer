import { useEffect, useMemo, useState } from "react";
import { codeToHtml } from "shiki";

import { Spinner } from "@arclayer/ui/spinner";

import { fetchAssetText } from "@/lib/assets/storage-transfer";
import type { AssetMasonryItem } from "@/types/assets-masonry";

import {
  buildAssetAuthHeaders,
  getAssetCodeLanguage,
  getAssetPreviewKind,
} from "./asset-preview-file-utils";

type AssetPreviewTextViewerProps = {
  active: AssetMasonryItem;
  t: (key: string, options?: Record<string, unknown>) => string;
};

type TextPreviewState = {
  html: string | null;
  mode: "code" | "plain";
  text: string;
};

async function loadAssetText(active: AssetMasonryItem) {
  if (!active.contentUrl) throw new Error("missing asset content url");

  return fetchAssetText({
    url: active.contentUrl,
    headers: buildAssetAuthHeaders(),
    credentials: "include",
  });
}

async function buildHighlightedHtml(active: AssetMasonryItem, source: string) {
  const lang = getAssetCodeLanguage(active);
  return codeToHtml(source, {
    lang,
    theme: "github-light",
  });
}

function getPreviewMode(active: AssetMasonryItem): "code" | "plain" {
  const kind = getAssetPreviewKind(active);
  if (kind === "code" || kind === "json" || kind === "markdown" || kind === "svg") {
    return "code";
  }
  return "plain";
}

export function AssetPreviewTextViewer(props: AssetPreviewTextViewerProps) {
  const [state, setState] = useState<TextPreviewState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mode = useMemo(() => getPreviewMode(props.active), [props.active]);

  useEffect(() => {
    let cancelled = false;
    setState(null);
    setError(null);

    void (async () => {
      try {
        const text = await loadAssetText(props.active);
        const html = mode === "code" ? await buildHighlightedHtml(props.active, text) : null;
        if (cancelled) return;
        setState({ html, mode, text });
      } catch (nextError) {
        if (cancelled) return;
        const message = nextError instanceof Error ? nextError.message : String(nextError);
        setError(message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, props.active]);

  if (error) {
    return (
      <div className="flex min-h-80 items-center justify-center rounded-[20px] border border-border/60 bg-card/70 p-8 text-center">
        <div className="space-y-2">
          <div className="text-title3 font-semibold text-label-primary">
            {props.t("assets:ASSET_PREVIEW_LOAD_FAILED")}
          </div>
          <div className="text-footnote text-label-secondary">{error}</div>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="flex min-h-80 items-center justify-center rounded-[20px] border border-border/60 bg-card/70 p-8">
        <Spinner className="size-5 text-label-secondary" />
      </div>
    );
  }

  if (state.mode === "code" && state.html) {
    return (
      <div className="overflow-hidden rounded-[20px] border border-border/60 bg-card/80">
        <div className="border-b border-border/60 px-4 py-3 text-caption text-label-secondary">
          {props.t("assets:ASSET_TEXT_PREVIEW_SOURCE")}
        </div>
        <div
          className="overflow-auto [&_pre]:m-0! [&_pre]:max-h-[70vh]! [&_pre]:overflow-auto! [&_pre]:rounded-none! [&_pre]:bg-transparent! [&_pre]:p-5!"
          dangerouslySetInnerHTML={{ __html: state.html }}
        />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[20px] border border-border/60 bg-card/80">
      <div className="border-b border-border/60 px-4 py-3 text-caption text-label-secondary">
        {props.t("assets:ASSET_TEXT_PREVIEW_CONTENT")}
      </div>
      <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap break-words px-5 py-5 text-footnote  text-label-primary">
        {state.text}
      </pre>
    </div>
  );
}
