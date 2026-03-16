import { useEffect, useState, type ReactNode } from "react";
import { Button as ButtonPrimitive } from "@arclayer/ui/button-primitive";
import { cn } from "@arclayer/lib/utils";
import { SidebarMenu, SidebarMenuItem } from "./sidebar-menu";

export type MiniCategoryNavItem = {
  key: string;
  icon?: ReactNode;
  label: ReactNode;
  disabled?: boolean;
};

export type MiniCategoryNavAnchorFollowOptions = {
  getAnchorId: (key: string) => string;
  root?: Element | null;
  rootMargin?: string;
  threshold?: number | number[];
};

export type MiniCategoryNavProps = {
  items: readonly MiniCategoryNavItem[];
  selectedKey: string;
  onSelect: (key: string) => void;
  className?: string;
  itemClassName?: string;
  itemHeightClassName?: string;
  ariaLabel?: string;
  /**
   * When provided, the nav highlights the item whose anchor section is currently in view.
   *
   * - This is a *visual* follow behavior only: it doesn't call `onSelect`
   * - Keeps existing controlled `selectedKey` contract intact (no scroll loops)
   */
  anchorFollow?: MiniCategoryNavAnchorFollowOptions;
};

function useAnchorFollowedKey(
  items: readonly MiniCategoryNavItem[],
  options: MiniCategoryNavAnchorFollowOptions | undefined,
): string | null {
  const [followedKey, setFollowedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!options) return;
    if (typeof window === "undefined") return;
    if (typeof IntersectionObserver === "undefined") return;

    const elementToKey = new Map<Element, string>();
    for (const item of items) {
      const id = options.getAnchorId(item.key);
      const el = document.getElementById(id);
      if (!el) continue;
      elementToKey.set(el, item.key);
    }

    if (elementToKey.size === 0) return;

    const root = options.root ?? null;
    const rootMargin = options.rootMargin ?? "-20% 0px -70% 0px";
    const threshold = options.threshold ?? 0;

    const visibleTopsByKey = new Map<string, number>();

    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const key = elementToKey.get(entry.target);
          if (!key) continue;

          if (entry.isIntersecting) visibleTopsByKey.set(key, entry.boundingClientRect.top);
          else visibleTopsByKey.delete(key);
        }

        let bestKey: string | null = null;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (const [key, top] of visibleTopsByKey.entries()) {
          const distance = Math.abs(top);
          if (distance >= bestDistance) continue;
          bestDistance = distance;
          bestKey = key;
        }

        if (!bestKey) return;
        setFollowedKey(bestKey);
      },
      { root, rootMargin, threshold },
    );

    for (const el of elementToKey.keys()) obs.observe(el);

    return () => obs.disconnect();
  }, [items, options]);

  return followedKey;
}

export function MiniCategoryNav({
  items,
  selectedKey,
  onSelect,
  className,
  itemClassName,
  itemHeightClassName = "h-10",
  ariaLabel,
  anchorFollow,
}: MiniCategoryNavProps) {
  const followedKey = useAnchorFollowedKey(items, anchorFollow);
  const activeKey = followedKey ?? selectedKey;

  return (
    <nav aria-label={ariaLabel} className={className}>
      <SidebarMenu className="gap-1.5">
        {items.map((item) => {
          const isActive = item.key === activeKey;
          const isDisabled = Boolean(item.disabled);

          return (
            <SidebarMenuItem key={item.key}>
              <ButtonPrimitive
                type="button"
                onClick={() => {
                  if (isDisabled) return;
                  onSelect(item.key);
                }}
                aria-current={isActive ? "true" : undefined}
                aria-disabled={isDisabled ? "true" : undefined}
                disabled={isDisabled}
                data-active={isActive ? "true" : "false"}
                tapScale={1}
                className={cn(
                  "relative flex w-full min-w-0 items-center justify-start gap-2 rounded-lg",
                  itemHeightClassName,
                  "px-4 pl-6",
                  "text-callout",
                  "text-left",
                  "transition-[color,background-color,transform,box-shadow,width,height,padding,margin,gap] duration-400 ease-[cubic-bezier(0.75,0,0.25,1)]",
                  "motion-reduce:transition-none",
                  "text-label-secondary hover:text-label-primary!",
                  "bg-transparent hover:bg-accent/40 data-[active=true]:bg-accent/50",
                  "data-[active=true]:font-semibold data-[active=true]:text-foreground!",
                  isDisabled
                    ? cn(
                        "opacity-60 cursor-not-allowed",
                        "hover:bg-transparent hover:text-label-secondary",
                      )
                    : "cursor-pointer",
                  itemClassName,
                )}
              >
                {item.icon ? (
                  <span className="shrink-0 text-label-secondary data-[active=true]:text-foreground">
                    {item.icon}
                  </span>
                ) : null}
                <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
              </ButtonPrimitive>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </nav>
  );
}
