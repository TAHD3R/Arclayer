import type { ReactNode } from "react";

import { cn } from "@arclayer/lib/utils";

export function AssetInspectorShell(props: { children: ReactNode }) {
  return <div className="space-y-8">{props.children}</div>;
}

export function AssetInspectorPanel(props: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <div className="text-caption font-semibold text-label-secondary">{props.title}</div>
        {props.description ? (
          <p className="text-caption leading-5 text-label-secondary">{props.description}</p>
        ) : null}
      </header>
      {props.children}
    </section>
  );
}

export function AssetInspectorList(props: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("[&>*+*]:border-t [&>*+*]:border-border/50", props.className)}>
      {props.children}
    </div>
  );
}

export function AssetInspectorRow(props: {
  label: string;
  value: ReactNode;
  description?: ReactNode;
  separate?: boolean;
}) {
  return (
    <div className="grid gap-x-4 gap-y-1 py-3 md:grid-cols-[7rem_minmax(0,1fr)] md:items-start">
      <div className="text-caption text-label-secondary">{props.label}</div>
      <div className="min-w-0 text-footnote text-foreground md:text-right">{props.value}</div>
      {props.description ? (
        <div className="text-caption leading-5 text-label-secondary md:col-start-2 md:text-right">
          {props.description}
        </div>
      ) : null}
    </div>
  );
}

export function AssetInspectorActionRow(props: {
  label: string;
  value: ReactNode;
  onClick: () => void;
  separate?: boolean;
}) {
  return (
    <button
      type="button"
      className="grid w-full -mx-3 gap-x-4 gap-y-1 rounded-xl px-3 py-3 text-left transition-[background-color,color] hover:bg-accent/45 hover:text-foreground focus-visible:bg-accent/45 md:grid-cols-[7rem_minmax(0,1fr)] md:items-start"
      onClick={props.onClick}
    >
      <span className="text-caption text-label-secondary">{props.label}</span>
      <span className="min-w-0 text-footnote text-foreground md:text-right">{props.value}</span>
    </button>
  );
}

export function AssetInspectorMono(props: { value: string | null | undefined }) {
  return (
    <span className="font-mono text-caption break-all text-foreground">{props.value || "-"}</span>
  );
}
