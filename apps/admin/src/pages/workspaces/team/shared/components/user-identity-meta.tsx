import * as React from "react";

export type UserIdentityMetaItem = {
  key?: string;
  label: React.ReactNode;
  value: React.ReactNode;
};

function hasRenderableContent(node: React.ReactNode): boolean {
  if (node === null || node === undefined || node === false) return false;
  if (typeof node === "string") return node.trim().length > 0;
  if (typeof node === "number") return true;
  if (Array.isArray(node)) return node.some(hasRenderableContent);
  return true;
}

export function UserIdentityMetaList(props: { items: UserIdentityMetaItem[]; className?: string }) {
  const items = props.items.filter(
    (item) => hasRenderableContent(item.label) && hasRenderableContent(item.value),
  );

  if (items.length === 0) {
    return null;
  }

  return (
    <dl className={props.className ?? "grid gap-2"}>
      {items.map((item, index) => (
        <div
          key={item.key ?? index}
          className="flex items-start justify-between gap-3 border-b border-border/50 pb-2 last:border-b-0 last:pb-0"
        >
          <dt className="shrink-0 text-caption text-label-secondary">{item.label}</dt>
          <dd className="min-w-0 text-right text-footnote text-label-primary wrap-break-word">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
