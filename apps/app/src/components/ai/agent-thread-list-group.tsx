"use client";

import { ChevronRightIcon } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import { cn } from "@arclayer/lib/utils";
import { Button as ButtonPrimitive } from "@arclayer/ui/button-primitive";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@arclayer/ui/collapsible";

interface AgentThreadListGroupProps {
  readonly label: string;
  readonly children: ReactNode;
}

export function AgentThreadListGroup({ label, children }: AgentThreadListGroupProps) {
  const [open, setOpen] = useState(true);
  const contentId = `agent-thread-group-${useId().replaceAll(":", "")}`;

  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <section aria-label={label} className="py-1">
        <h3 className="px-2 py-1">
          <CollapsibleTrigger asChild>
            <ButtonPrimitive
              type="button"
              tapScale={1}
              aria-controls={contentId}
              className="group/thread-label flex h-7 w-full items-center gap-2 rounded-md px-1 text-left text-caption font-semibold text-label-tertiary outline-none transition-colors duration-100 hover:text-label-primary focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
            >
              <span className="min-w-0 flex-1 truncate">{label}</span>
              <ChevronRightIcon
                className={cn(
                  "size-4 shrink-0 opacity-0 transition-[transform,opacity] duration-150 motion-reduce:transition-none",
                  "group-hover/thread-label:opacity-100 group-focus-visible/thread-label:opacity-100",
                  open && "rotate-90",
                )}
                aria-hidden="true"
              />
            </ButtonPrimitive>
          </CollapsibleTrigger>
        </h3>
        <CollapsibleContent
          id={contentId}
          className="overflow-hidden data-[state=closed]:animate-[arclayer-collapsible-up_140ms_ease-out] data-[state=open]:animate-[arclayer-collapsible-down_180ms_ease-out] motion-reduce:animate-none"
        >
          <div className="space-y-0.5 pb-2">{children}</div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}
