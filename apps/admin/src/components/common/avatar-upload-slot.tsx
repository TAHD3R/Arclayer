import { Trash2 } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@celestial/lib/utils";
import { Button } from "@celestial/ui/button";
import { LoaderOne } from "@celestial/ui/loader";
import { OrganizationAvatar } from "./entity-avatar";

export type AvatarUploadSlotProps = {
  src?: string | null;
  fallback: ReactNode;
  shape?: "circle" | "square";
  size?: number;
  disabled?: boolean;
  loading?: boolean;
  onPick: () => void;
  onRemove?: () => void;
  canRemove?: boolean;
  uploadAriaLabel: string;
  removeAriaLabel: string;
  className?: string;
};

export function AvatarUploadSlot(props: AvatarUploadSlotProps) {
  const size = props.size ?? 56;
  const shape = props.shape ?? "square";
  const canRemove = Boolean(props.onRemove) && (props.canRemove ?? true);
  const radiusClass = shape === "circle" ? "rounded-full" : "rounded-md";
  const isBusy = Boolean(props.loading) || Boolean(props.disabled);

  return (
    <div className={cn("relative inline-flex", props.className)}>
      <button
        type="button"
        disabled={isBusy}
        aria-label={props.uploadAriaLabel}
        aria-busy={props.loading ? true : undefined}
        onClick={() => props.onPick()}
        className={cn(
          radiusClass,
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
          isBusy ? "cursor-not-allowed opacity-70" : "cursor-pointer",
        )}
      >
        <OrganizationAvatar
          name={typeof props.fallback === "string" ? props.fallback : undefined}
          assetRef={props.src ?? undefined}
          size={size}
          className={cn("bg-muted/20 text-foreground ring-1 ring-border/60", radiusClass)}
        />
        {!props.src ? (
          <span
            className={cn(
              "pointer-events-none absolute inset-0 flex items-center justify-center text-foreground",
              radiusClass,
            )}
          >
            {props.fallback}
          </span>
        ) : null}
      </button>

      {props.loading ? (
        <div
          className={cn(
            "absolute inset-0 grid place-items-center bg-background/40 backdrop-blur-[1px]",
            radiusClass,
          )}
        >
          <LoaderOne />
        </div>
      ) : null}

      {canRemove ? (
        <Button
          aria-label={props.removeAriaLabel}
          size="icon-xs"
          variant="destructive"
          disabled={isBusy}
          className="absolute -bottom-1 -right-1 rounded-full shadow-sm"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            props.onRemove?.();
          }}
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}
