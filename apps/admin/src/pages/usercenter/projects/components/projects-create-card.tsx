import { Plus } from "lucide-react";

import { cn } from "@arclayer/lib/utils";

interface ProjectsCreateCardProps {
  title: string;
  description: string;
  onClick: () => void;
  className?: string;
}

export function ProjectsCreateCard(props: ProjectsCreateCardProps) {
  return (
    <button
      type="button"
      className={cn(
        "col-span-1 flex min-h-48 flex-col rounded-lg border border-dashed border-border/70 bg-card/50 p-4 text-left",
        "transition-colors duration-200 hover:border-border hover:bg-accent/35",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        props.className,
      )}
      onClick={props.onClick}
    >
      <div className="mb-4 flex flex-row justify-between">
        <div className="flex size-10 items-center justify-center rounded-md border border-dashed border-border/70 bg-background/60 text-label-secondary">
          <Plus size={18} />
        </div>
      </div>

      <div className="flex flex-1 flex-col wrap-break-word" style={{ overflowWrap: "anywhere" }}>
        <div className="text-headline font-semibold">{props.title}</div>
        <p className="mt-1 text-footnote text-label-secondary">{props.description}</p>
      </div>
    </button>
  );
}
