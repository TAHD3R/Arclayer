import { Button as ButtonPrimitive } from "@arclayer/ui/button-primitive";
import { ChevronRight } from "lucide-react";

import { cn } from "@arclayer/lib/utils";
import { NAV_CHEVRON_CLASSNAME } from "./nav-node-styles";

export function NavGroupMarker(props: {
  label: string;
  isOpen: boolean;
  contentId: string;
  onToggle: () => void;
}) {
  return (
    <div
      data-slot="admin-side-nav-group-marker"
      className={cn(
        "relative overflow-hidden py-2",
        "transition-[padding] duration-[280ms] ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none",
        "group-data-[state=expanded]:px-2",
        "group-data-[state=expanded]:pt-3",
        "group-data-[state=expanded]:pb-2.5",
      )}
    >
      <div
        data-slot="admin-side-nav-group-marker-divider"
        className={cn(
          "border-b border-sidebar-border origin-left transform-gpu",
          "transition-[opacity,transform] duration-[280ms] ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none",
          "group-data-[state=expanded]:absolute group-data-[state=expanded]:inset-x-3 group-data-[state=expanded]:top-1/2",
          "group-data-[state=expanded]:scale-x-95 group-data-[state=expanded]:opacity-0",
        )}
      />
      <ButtonPrimitive
        type="button"
        tapScale={1}
        aria-expanded={props.isOpen}
        aria-controls={props.contentId}
        onClick={props.onToggle}
        data-slot="admin-side-nav-group-label"
        className={cn(
          "group/section-label pointer-events-none absolute inset-x-3 top-1.5 flex h-auto w-[calc(100%-1.5rem)] select-none items-center rounded-none px-0 py-0 text-left text-footnote! font-semibold text-label-tertiary",
          "origin-left transform-gpu transition-[opacity,transform] duration-[280ms] ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none",
          "-translate-y-1 opacity-0",
          "group-data-[state=expanded]:pointer-events-auto group-data-[state=expanded]:relative group-data-[state=expanded]:inset-auto group-data-[state=expanded]:top-auto group-data-[state=expanded]:w-full",
          "group-data-[state=expanded]:translate-y-0 group-data-[state=expanded]:opacity-100",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        )}
      >
        <span className="min-w-0 flex-1 truncate">{props.label}</span>
        <ChevronRight
          size={16}
          className={cn(
            NAV_CHEVRON_CLASSNAME,
            "opacity-0",
            "group-hover/section-label:opacity-100 group-focus-visible/section-label:opacity-100",
            props.isOpen && "rotate-90",
          )}
          aria-hidden="true"
        />
      </ButtonPrimitive>
    </div>
  );
}

export function NavDivider() {
  return (
    <li data-slot="admin-side-nav-divider" className="py-2" aria-hidden="true">
      <div className="border-b border-sidebar-border" />
    </li>
  );
}
