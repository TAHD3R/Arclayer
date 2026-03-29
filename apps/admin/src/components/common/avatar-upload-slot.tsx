import { Trash2 } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@arclayer/lib/utils";
import { Button } from "@arclayer/ui/button";
import { SpinnerOverlay } from "@arclayer/ui/spinner";
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
  const shellClassName = cn(
    "inline-flex items-center justify-center overflow-hidden bg-muted/20 text-label-primary ring-1 ring-border/60",
    radiusClass,
  );

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
        {props.src ? (
          <OrganizationAvatar assetRef={props.src} size={size} className={shellClassName} />
        ) : (
          <div className={cn(shellClassName, "font-medium")} style={{ width: size, height: size }}>
            {props.fallback}
          </div>
        )}
      </button>

      {props.loading ? <SpinnerOverlay className={cn("bg-card/40", radiusClass)} /> : null}

      {canRemove ? (
        <Button
          aria-label={props.removeAriaLabel}
          size="icon-xs"
          variant="destructive"
          disabled={isBusy}
          className="absolute -bottom-1 -right-1 rounded-full "
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
