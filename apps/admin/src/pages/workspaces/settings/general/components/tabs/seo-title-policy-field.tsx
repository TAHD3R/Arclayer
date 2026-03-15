import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import type { TitlePolicyV1, TitlePolicyV1Part } from "@celestial/internal-types";
import { useTranslation } from "react-i18next";

import { Button } from "@celestial/ui/button";
import { Card, CardContent } from "@celestial/ui/card";
import { Input } from "@celestial/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@celestial/ui/select";
import { Switch } from "@celestial/ui/switch";

const TOKEN_OPTIONS = [
  { value: "pageTitle", label: "pageTitle" },
  { value: "siteName", label: "siteName" },
  { value: "siteSubtitle", label: "siteSubtitle" },
] as const;

type TokenValue = (typeof TOKEN_OPTIONS)[number]["value"];

function toPartDndId(index: number): string {
  return `titlePolicyPart:${index}`;
}

function parsePartDndId(id: unknown): number | null {
  if (typeof id !== "string") return null;
  if (!id.startsWith("titlePolicyPart:")) return null;
  const raw = id.slice("titlePolicyPart:".length);
  const idx = Number(raw);
  return Number.isInteger(idx) ? idx : null;
}

function moveItem<T>(arr: T[], from: number, to: number): T[] {
  if (from === to) return arr;
  const next = [...arr];
  const [picked] = next.splice(from, 1);
  if (picked === undefined) return arr;
  next.splice(to, 0, picked);
  return next;
}

function isTokenPart(
  part: TitlePolicyV1Part,
): part is Extract<TitlePolicyV1Part, { kind: "token" }> {
  return part.kind === "token";
}

function isLiteralPart(
  part: TitlePolicyV1Part,
): part is Extract<TitlePolicyV1Part, { kind: "literal" }> {
  return part.kind === "literal";
}

function cleanupTitle(input: string): string {
  let s = String(input || "")
    .replaceAll(/\s+/g, " ")
    .trim();
  if (!s) return "";
  const sep = /^(?:[-–—|·•:]+|\s+)+|(?:[-–—|·•:]+|\s+)+$/g;
  s = s.replace(sep, "").trim();
  return s;
}

function composeTitleFromPolicyV1(args: {
  policy: TitlePolicyV1;
  pathnameNoLocale: string;
  pageTitle: string;
  siteName: string;
  siteSubtitle: string;
}): string {
  const { policy } = args;
  const isHome = (args.pathnameNoLocale || "/").trim() === "/";
  const homeMode = policy.homeMode ?? "siteOnly";
  const dedupe = policy.dedupe !== false;

  let pageTitle = (args.pageTitle || "").trim();
  const siteName = (args.siteName || "").trim();
  const siteSubtitle = (args.siteSubtitle || "").trim();
  if (dedupe && siteName && pageTitle && pageTitle === siteName) pageTitle = "";

  if (isHome && homeMode === "siteOnly") {
    return siteName || pageTitle || "";
  }

  const tokenValues: Record<string, string> = { pageTitle, siteName, siteSubtitle };
  const pieces: string[] = [];
  for (const part of policy.parts) {
    if (isLiteralPart(part)) {
      pieces.push(part.value);
      continue;
    }
    if (isTokenPart(part)) {
      const v = tokenValues[part.value] || "";
      if (!v.trim()) continue;
      pieces.push(v);
    }
  }
  return cleanupTitle(pieces.join(""));
}

function TitlePolicyPartRow(props: {
  index: number;
  part: TitlePolicyV1Part;
  onChange: (next: TitlePolicyV1Part) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const dndId = toPartDndId(props.index);
  const draggable = useDraggable({ id: dndId, data: { index: props.index } });
  const droppable = useDroppable({ id: dndId, data: { index: props.index } });

  return (
    <div
      ref={droppable.setNodeRef}
      className={[
        "flex items-center gap-2 rounded-md border px-3 py-2",
        droppable.isOver ? "border-primary/60 bg-primary/5" : "border-border",
        draggable.isDragging ? "opacity-60" : "",
      ].join(" ")}
    >
      <div
        ref={draggable.setNodeRef}
        className="cursor-grab select-none text-label-secondary"
        {...draggable.listeners}
        {...draggable.attributes}
        aria-label={t("settings:SETTINGS_SEO_TITLE_FORMAT_DRAG_HANDLE")}
      >
        ⋮⋮
      </div>

      {isTokenPart(props.part) ? (
        <div className="flex flex-1 items-center gap-2">
          <span className="shrink-0 whitespace-nowrap text-footnote text-label-secondary">
            {t("settings:SETTINGS_SEO_TITLE_FORMAT_PART_TOKEN")}
          </span>
          <Select
            value={props.part.value}
            onValueChange={(next) => {
              if (next !== "pageTitle" && next !== "siteName" && next !== "siteSubtitle") return;
              props.onChange({ kind: "token", value: next as TokenValue });
            }}
          >
            <SelectTrigger className="min-w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="start">
              {TOKEN_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div className="flex flex-1 items-center gap-2">
          <span className="shrink-0 whitespace-nowrap text-footnote text-label-secondary">
            {t("settings:SETTINGS_SEO_TITLE_FORMAT_PART_LITERAL")}
          </span>
          <Input
            value={props.part.value}
            placeholder={t("settings:SETTINGS_SEO_TITLE_FORMAT_LITERAL_PLACEHOLDER")}
            onChange={(event) => props.onChange({ kind: "literal", value: event.target.value })}
          />
        </div>
      )}

      <Button type="button" variant="ghost" className="text-destructive" onClick={props.onRemove}>
        {t("settings:SETTINGS_REMOVE")}
      </Button>
    </div>
  );
}

const DEFAULT_POLICY: TitlePolicyV1 = {
  parts: [
    { kind: "token", value: "pageTitle" },
    { kind: "literal", value: " - " },
    { kind: "token", value: "siteName" },
  ],
  homeMode: "siteOnly",
  dedupe: true,
};

export function SeoTitlePolicyField(props: {
  value?: TitlePolicyV1;
  onChange?: (next: TitlePolicyV1) => void;
  siteName: string;
  siteSubtitle: string;
}) {
  const { t } = useTranslation();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const value = props.value ?? DEFAULT_POLICY;
  const onChange = props.onChange ?? (() => {});

  const titlePreview = useMemo(
    () =>
      composeTitleFromPolicyV1({
        policy: value,
        pathnameNoLocale: "/about",
        pageTitle: t("settings:SETTINGS_SEO_TITLE_FORMAT_SAMPLE_PAGE_TITLE"),
        siteName: props.siteName || t("settings:SETTINGS_SEO_TITLE_FORMAT_SAMPLE_SITE_NAME"),
        siteSubtitle:
          props.siteSubtitle || t("settings:SETTINGS_SEO_TITLE_FORMAT_SAMPLE_SITE_SUBTITLE"),
      }),
    [props.siteName, props.siteSubtitle, t, value],
  );

  const onDragEnd = (event: DragEndEvent) => {
    const from = parsePartDndId(event.active.id);
    const to = parsePartDndId(event.over?.id ?? null);
    setActiveIndex(null);
    if (from === null || to === null || from === to) return;
    onChange({ ...value, parts: moveItem(value.parts, from, to) });
  };

  return (
    <div className="flex flex-col gap-3">
      <Card className="bg-muted/30 shadow-none">
        <CardContent className="p-4">
          <div className="text-footnote text-label-secondary">
            {t("settings:SETTINGS_SEO_TITLE_FORMAT_SEARCH_PREVIEW")}
          </div>
          <div className="mt-2 font-medium">{titlePreview || "-"}</div>
          <div className="mt-1 text-caption text-label-secondary">
            {t("settings:SETTINGS_SEO_TITLE_FORMAT_SEARCH_PREVIEW_HINT")}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <span className="text-footnote text-label-secondary">
            {t("settings:SETTINGS_SEO_TITLE_FORMAT_HOME_MODE")}
          </span>
          <Select
            value={value.homeMode ?? "siteOnly"}
            onValueChange={(next) => {
              if (next !== "siteOnly" && next !== "policy") return;
              onChange({ ...value, homeMode: next });
            }}
          >
            <SelectTrigger className="min-w-40">
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
        </div>

        <label className="flex items-center gap-2 text-footnote text-label-secondary">
          <span>{t("settings:SETTINGS_SEO_TITLE_FORMAT_DEDUPE")}</span>
          <Switch
            checked={value.dedupe !== false}
            onCheckedChange={(checked) => onChange({ ...value, dedupe: checked })}
          />
        </label>
      </div>

      <DndContext
        onDragStart={(event) => setActiveIndex(parsePartDndId(event.active.id))}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveIndex(null)}
      >
        <div className="flex flex-col gap-2">
          {value.parts.map((part, index) => (
            <TitlePolicyPartRow
              key={index}
              index={index}
              part={part}
              onChange={(next) => {
                const parts = [...value.parts];
                parts[index] = next;
                onChange({ ...value, parts });
              }}
              onRemove={() => {
                const parts = value.parts.filter((_, currentIndex) => currentIndex !== index);
                onChange({ ...value, parts: parts.length ? parts : value.parts });
              }}
            />
          ))}
        </div>

        <DragOverlay>
          {activeIndex !== null ? (
            <div className="rounded-md border border-border bg-card px-3 py-2 shadow">
              <span className="text-footnote">
                {t("settings:SETTINGS_SEO_TITLE_FORMAT_DRAGGING")} #{activeIndex + 1}
              </span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            onChange({
              ...value,
              parts: [...value.parts, { kind: "token", value: "pageTitle" }],
            })
          }
        >
          {t("settings:SETTINGS_SEO_TITLE_FORMAT_ADD_TOKEN")}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            onChange({
              ...value,
              parts: [...value.parts, { kind: "literal", value: " - " }],
            })
          }
        >
          {t("settings:SETTINGS_SEO_TITLE_FORMAT_ADD_LITERAL")}
        </Button>
      </div>
    </div>
  );
}
