import React from "react";

import type { LocalizedString, ViewerContext } from "@celestial/site-block-protocol";
import { resolveLocalizedValue } from "@celestial/site-block-protocol";

import type { PrefabRenderer } from "../BlockRegistry";
import { buildBlockStyles, resolveNodeVisualProps } from "../visual-props";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function asLocalizedString(value: unknown): LocalizedString | undefined {
  return isRecord(value) ? (value as LocalizedString) : undefined;
}

function resolveText(value: unknown, ctx: ViewerContext): string {
  const localized = asLocalizedString(value);
  return resolveLocalizedValue(localized, ctx) ?? "";
}

function resolveHref(href: string, basePath: string | undefined): string {
  const raw = (href || "").trim();
  if (!raw) return raw;

  // Only prefix absolute-path links. Keep external URLs, protocol-relative URLs, hashes, and mailto/tel intact.
  if (!raw.startsWith("/") || raw.startsWith("//")) return raw;

  const base = (basePath || "").trim();
  if (!base) return raw;

  const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
  return normalizedBase + raw;
}

type CardPrefabData = {
  title?: LocalizedString;
  description?: LocalizedString;
  imageSrc?: string;
  href?: string;
};

function resolveCardData(value: unknown): CardPrefabData {
  if (!isRecord(value)) return {};

  const result: CardPrefabData = {};

  const title = asLocalizedString(value["title"]);
  const description = asLocalizedString(value["description"]);
  const imageSrc = asString(value["imageSrc"]);
  const href = asString(value["href"]);

  if (title) result.title = title;
  if (description) result.description = description;
  if (imageSrc) result.imageSrc = imageSrc;
  if (href) result.href = href;

  return result;
}

/**
 * 示例 Prefab：card
 *
 * - 外部以 `__prefab__` 节点承载，通过 props.prefab === "card" 命中
 * - 支持 children 作为 slot（内部递归走 registry.render）
 * - 支持 layout/style/animation + responsive（通过 visual helper 计算）
 */
export const cardPrefabRenderer: PrefabRenderer = (node, ctx, registry) => {
  const data = resolveCardData(node.props.props ?? node.props.data);

  const title = data.title ? resolveText(data.title, ctx) : "";
  const description = data.description ? resolveText(data.description, ctx) : "";
  const href = data.href ? resolveHref(data.href, ctx.basePath) : undefined;

  const style = buildBlockStyles(resolveNodeVisualProps(node, ctx));

  // 给示例 prefab 一些默认视觉（不会覆盖用户显式指定的属性）
  if (!style.borderStyle) style.borderStyle = "solid";
  if (!style.borderWidth) style.borderWidth = "1px";
  if (!style.borderColor) style.borderColor = "rgba(0,0,0,0.12)";
  if (!style.borderRadius) style.borderRadius = "12px";
  if (!style.padding) style.padding = "12px";

  const RootTag = href ? "a" : "section";

  return (
    <RootTag
      data-block-type={node.type}
      data-block-id={node.id}
      data-prefab="card"
      {...(href ? { href } : {})}
      style={style}
    >
      {data.imageSrc ? (
        <img
          data-prefab-slot="media"
          src={data.imageSrc}
          alt={title || "card"}
          style={{ width: "100%", borderRadius: "10px" }}
        />
      ) : null}

      {title ? (
        <div data-prefab-slot="title" style={{ fontWeight: 600, marginTop: data.imageSrc ? 10 : 0 }}>
          {title}
        </div>
      ) : null}
      {description ? (
        <div data-prefab-slot="description" style={{ opacity: 0.85, marginTop: title ? 6 : 0 }}>
          {description}
        </div>
      ) : null}

      {Array.isArray(node.children) && node.children.length ? (
        <div data-prefab-slot="children" style={{ marginTop: title || description ? 10 : 0 }}>
          {node.children.map((child) => (
            <React.Fragment key={child.id}>{registry.render(child, ctx)}</React.Fragment>
          ))}
        </div>
      ) : null}
    </RootTag>
  );
};
