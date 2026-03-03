import { useMemo, useState } from "react";
import { Button, Card, Input, Select, Space, Switch, Typography } from "antd";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import type { TitlePolicyV1, TitlePolicyV1Part } from "@celestial/internal-types";
import { useTranslation } from "react-i18next";

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

  const isOver = droppable.isOver;
  const isDragging = draggable.isDragging;

  return (
    <div
      ref={droppable.setNodeRef}
      className={[
        "flex items-center gap-2 rounded-md border px-3 py-2",
        isOver ? "border-primary/60 bg-primary/5" : "border-border",
        isDragging ? "opacity-60" : "",
      ].join(" ")}
    >
      <div
        ref={draggable.setNodeRef}
        className="cursor-grab select-none text-muted-foreground"
        {...draggable.listeners}
        {...draggable.attributes}
        aria-label={t("settings:SETTINGS_SEO_TITLE_FORMAT_DRAG_HANDLE")}
      >
        ⋮⋮
      </div>

      {isTokenPart(props.part) ? (
        <Space size={8} className="flex-1">
          <Typography.Text className="whitespace-nowrap">
            {t("settings:SETTINGS_SEO_TITLE_FORMAT_PART_TOKEN")}
          </Typography.Text>
          <Select
            value={props.part.value}
            style={{ minWidth: 160 }}
            options={TOKEN_OPTIONS as unknown as Array<{ value: string; label: string }>}
            onChange={(next: string) => {
              if (next !== "pageTitle" && next !== "siteName" && next !== "siteSubtitle") return;
              props.onChange({ kind: "token", value: next as TokenValue });
            }}
          />
        </Space>
      ) : (
        <Space size={8} className="flex-1">
          <Typography.Text className="whitespace-nowrap">
            {t("settings:SETTINGS_SEO_TITLE_FORMAT_PART_LITERAL")}
          </Typography.Text>
          <Input
            value={props.part.value}
            placeholder={t("settings:SETTINGS_SEO_TITLE_FORMAT_LITERAL_PLACEHOLDER")}
            onChange={(e) => props.onChange({ kind: "literal", value: e.target.value })}
          />
        </Space>
      )}

      <Button danger onClick={props.onRemove} autoInsertSpace={false}>
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
  /**
   * antd Form.Item will inject `value` + `onChange` for controlled fields.
   * Keep them optional to satisfy TS at call sites where Form handles wiring.
   */
  value?: TitlePolicyV1;
  onChange?: (next: TitlePolicyV1) => void;
  siteName: string;
  siteSubtitle: string;
}) {
  const { t } = useTranslation();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const value = props.value ?? DEFAULT_POLICY;
  const onChange = props.onChange ?? (() => {});

  const titlePreview = useMemo(() => {
    return composeTitleFromPolicyV1({
      policy: value,
      pathnameNoLocale: "/about",
      pageTitle: t("settings:SETTINGS_SEO_TITLE_FORMAT_SAMPLE_PAGE_TITLE"),
      siteName: props.siteName || t("settings:SETTINGS_SEO_TITLE_FORMAT_SAMPLE_SITE_NAME"),
      siteSubtitle:
        props.siteSubtitle || t("settings:SETTINGS_SEO_TITLE_FORMAT_SAMPLE_SITE_SUBTITLE"),
    });
  }, [props.siteName, props.siteSubtitle, t, value]);

  const onDragEnd = (event: DragEndEvent) => {
    const from = parsePartDndId(event.active.id);
    const to = parsePartDndId(event.over?.id ?? null);
    setActiveIndex(null);
    if (from === null || to === null) return;
    if (from === to) return;
    const nextParts = moveItem(value.parts, from, to);
    onChange({ ...value, parts: nextParts });
  };

  return (
    <div className="flex flex-col gap-3">
      <Card size="small" className="bg-muted/30">
        <Typography.Text type="secondary">
          {t("settings:SETTINGS_SEO_TITLE_FORMAT_SEARCH_PREVIEW")}
        </Typography.Text>
        <div className="mt-2">
          <Typography.Text strong>{titlePreview || "-"}</Typography.Text>
          <div className="mt-1 text-xs text-muted-foreground">
            {t("settings:SETTINGS_SEO_TITLE_FORMAT_SEARCH_PREVIEW_HINT")}
          </div>
        </div>
      </Card>

      <Space size={12} wrap>
        <Space size={8}>
          <Typography.Text>{t("settings:SETTINGS_SEO_TITLE_FORMAT_HOME_MODE")}</Typography.Text>
          <Select
            value={value.homeMode ?? "siteOnly"}
            options={[
              {
                value: "siteOnly",
                label: t("settings:SETTINGS_SEO_TITLE_FORMAT_HOME_MODE_SITE_ONLY"),
              },
              { value: "policy", label: t("settings:SETTINGS_SEO_TITLE_FORMAT_HOME_MODE_POLICY") },
            ]}
            onChange={(next) => {
              if (next !== "siteOnly" && next !== "policy") return;
              onChange({ ...value, homeMode: next });
            }}
            style={{ minWidth: 160 }}
          />
        </Space>

        <Space size={8}>
          <Typography.Text>{t("settings:SETTINGS_SEO_TITLE_FORMAT_DEDUPE")}</Typography.Text>
          <Switch
            checked={value.dedupe !== false}
            onChange={(checked) => onChange({ ...value, dedupe: checked })}
          />
        </Space>
      </Space>

      <DndContext
        onDragStart={(e) => setActiveIndex(parsePartDndId(e.active.id))}
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
                const parts = value.parts.filter((_, i) => i !== index);
                onChange({ ...value, parts: parts.length ? parts : value.parts });
              }}
            />
          ))}
        </div>

        <DragOverlay>
          {activeIndex !== null ? (
            <div className="rounded-md border border-border bg-card px-3 py-2 shadow">
              <Typography.Text>
                {t("settings:SETTINGS_SEO_TITLE_FORMAT_DRAGGING")} #{activeIndex + 1}
              </Typography.Text>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <Space size={8} wrap>
        <Button
          onClick={() =>
            onChange({
              ...value,
              parts: [...value.parts, { kind: "token", value: "pageTitle" }],
            })
          }
          autoInsertSpace={false}
        >
          {t("settings:SETTINGS_SEO_TITLE_FORMAT_ADD_TOKEN")}
        </Button>
        <Button
          onClick={() =>
            onChange({
              ...value,
              parts: [...value.parts, { kind: "literal", value: " - " }],
            })
          }
          autoInsertSpace={false}
        >
          {t("settings:SETTINGS_SEO_TITLE_FORMAT_ADD_LITERAL")}
        </Button>
      </Space>
    </div>
  );
}
