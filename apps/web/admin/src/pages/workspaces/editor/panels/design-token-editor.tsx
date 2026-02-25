import { useState } from "react";
import { useTranslation } from "react-i18next";

import type {
  DesignTokenCollection,
  TokenDefinition,
  TokenLayer,
  TokenValue,
} from "@celestial/site-block-protocol";

interface DesignTokenEditorProps {
  collection: DesignTokenCollection | null;
  activeMode?: string;
  onTokenChange?: (key: string, mode: string, value: string) => void;
}

const LAYERS: TokenLayer[] = ["primitive", "semantic", "component"];

const LAYER_LABEL: Record<TokenLayer, string> = {
  primitive: "Primitive",
  semantic: "Semantic",
  component: "Component",
};

function isColor(v: string) {
  return v.startsWith("#") || v.startsWith("rgb") || v.startsWith("hsl");
}

function isRef(v: TokenValue): v is { $ref: string } {
  return typeof v === "object" && "$ref" in v;
}

function LayerSection({
  layer,
  tokens,
  mode,
  onTokenChange,
}: {
  layer: TokenLayer;
  tokens: TokenDefinition[];
  mode: string;
  onTokenChange?: (key: string, mode: string, value: string) => void;
}) {
  const [open, setOpen] = useState(true);

  if (tokens.length === 0) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1 py-1 text-caption font-semibold text-label-secondary"
      >
        <span className={`transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
        {LAYER_LABEL[layer]} ({tokens.length})
      </button>
      {open && (
        <div className="flex flex-col gap-1 pl-3">
          {tokens.map((token) => {
            const raw = token.values[mode];
            const ref = raw != null && isRef(raw);
            const display = ref ? raw.$ref : String(raw ?? "");
            const color = !ref && typeof display === "string" && isColor(display);

            return (
              <label key={token.key} className="flex items-center gap-2 text-caption">
                <span className="w-32 shrink-0 truncate text-label-secondary" title={token.key}>
                  {token.key}
                </span>
                {color && (
                  <span
                    className="size-3 shrink-0 rounded-sm border"
                    style={{ backgroundColor: display }}
                  />
                )}
                {ref ? (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-label-secondary">
                    {display}
                  </span>
                ) : (
                  <input
                    type="text"
                    value={display}
                    onChange={(e) => onTokenChange?.(token.key, mode, e.target.value)}
                    className="h-7 flex-1 rounded border bg-transparent px-2 text-caption focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                )}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function DesignTokenEditor({
  collection,
  activeMode,
  onTokenChange,
}: DesignTokenEditorProps) {
  const { t } = useTranslation(["content_pages"]);

  if (!collection) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <span className="text-caption text-label-secondary">
          {t("content_pages:EDITOR_DESIGN_TOKENS_EMPTY")}
        </span>
      </div>
    );
  }

  const allTokens = collection.collections.flatMap((c) => c.tokens);
  const modes = collection.collections[0]?.modes ?? ["default"];
  const mode = activeMode ?? modes[0] ?? "default";

  const grouped: Partial<Record<TokenLayer, TokenDefinition[]>> = {};
  for (const tok of allTokens) {
    (grouped[tok.layer] ??= []).push(tok);
  }

  return (
    <div className="flex flex-col gap-3 p-2">
      {modes.length > 1 && (
        <div className="flex gap-1">
          {modes.map((m) => (
            <button
              key={m}
              type="button"
              className={`rounded px-2 py-0.5 text-caption ${
                m === mode ? "bg-primary text-primary-foreground" : "bg-muted text-label-secondary"
              }`}
              onClick={() => onTokenChange?.("__mode__", m, m)}
            >
              {m}
            </button>
          ))}
        </div>
      )}
      {LAYERS.map((layer) => (
        <LayerSection
          key={layer}
          layer={layer}
          tokens={grouped[layer] ?? []}
          mode={mode}
          onTokenChange={onTokenChange}
        />
      ))}
    </div>
  );
}
