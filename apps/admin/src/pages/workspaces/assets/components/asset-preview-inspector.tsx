import type { ReactNode } from "react";

import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemSeparator,
  ItemTitle,
} from "@arclayer/ui/item";

import { Frame, FramePanel } from "@/components/reui/frame";

export function AssetInspectorShell(props: { children: ReactNode }) {
  return (
    <Frame variant="inverse" spacing="sm" stacked dense className="w-full">
      {props.children}
    </Frame>
  );
}

export function AssetInspectorPanel(props: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <FramePanel className="space-y-3">
      <div className="space-y-1">
        <div className="text-caption font-semibold uppercase tracking-[0.08em] text-label-secondary">
          {props.title}
        </div>
        {props.description ? (
          <p className="text-caption leading-5 text-label-secondary">{props.description}</p>
        ) : null}
      </div>
      {props.children}
    </FramePanel>
  );
}

export function AssetInspectorList(props: { children: ReactNode }) {
  return (
    <ItemGroup className="rounded-xl border border-border/60 bg-background/80">
      {props.children}
    </ItemGroup>
  );
}

export function AssetInspectorRow(props: {
  label: string;
  value: ReactNode;
  description?: ReactNode;
  separate?: boolean;
}) {
  return (
    <>
      <Item size="sm" className="items-start gap-3 px-3 py-3">
        <ItemContent className="gap-0.5">
          <ItemDescription className="text-caption uppercase tracking-[0.08em] text-label-secondary!">
            {props.label}
          </ItemDescription>
          <ItemTitle className="w-full min-w-0 text-foreground">{props.value}</ItemTitle>
          {props.description ? (
            <ItemDescription className="text-caption leading-5">
              {props.description}
            </ItemDescription>
          ) : null}
        </ItemContent>
      </Item>
      {props.separate ? <ItemSeparator className="border-border/60" /> : null}
    </>
  );
}

export function AssetInspectorActionRow(props: {
  label: string;
  value: ReactNode;
  onClick: () => void;
  separate?: boolean;
}) {
  return (
    <>
      <Item
        asChild
        size="sm"
        className="cursor-pointer px-3 py-3 transition-colors hover:bg-accent/40"
      >
        <button type="button" onClick={props.onClick}>
          <ItemContent className="gap-0.5">
            <ItemDescription className="text-caption uppercase tracking-[0.08em] text-label-secondary!">
              {props.label}
            </ItemDescription>
            <ItemTitle className="w-full min-w-0 text-foreground">{props.value}</ItemTitle>
          </ItemContent>
        </button>
      </Item>
      {props.separate ? <ItemSeparator className="border-border/60" /> : null}
    </>
  );
}

export function AssetInspectorMono(props: { value: string | null | undefined }) {
  return (
    <span className="font-mono text-caption break-all text-foreground">{props.value || "-"}</span>
  );
}
