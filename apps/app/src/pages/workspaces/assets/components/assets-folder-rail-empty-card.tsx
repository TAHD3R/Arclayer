import type { ReactNode } from "react";

import { Button } from "@arclayer/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@arclayer/ui/empty";

type AssetsFolderRailEmptyCardProps = {
  title: string;
  description: string;
  icon: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
};

export function AssetsFolderRailEmptyCard(props: AssetsFolderRailEmptyCardProps) {
  return (
    <Empty className="rounded-lg px-4 py-8">
      <EmptyHeader>
        <EmptyMedia variant="icon">{props.icon}</EmptyMedia>
        <EmptyTitle>{props.title}</EmptyTitle>
        <EmptyDescription>{props.description}</EmptyDescription>
      </EmptyHeader>
      {props.actionLabel && props.onAction ? (
        <Button className="mt-4" size="sm" variant="accent" onClick={props.onAction}>
          {props.actionLabel}
        </Button>
      ) : null}
    </Empty>
  );
}
