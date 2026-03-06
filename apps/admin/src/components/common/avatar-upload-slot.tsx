import { Avatar, Button } from "antd";
import { Trash2 } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@celestial/lib/utils";
import { LoaderOne } from "@celestial/ui/loader";

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
        <Avatar
          size={size}
          shape={shape}
          src={props.src ?? undefined}
          className="bg-muted/20 ring-1 ring-border/60"
        >
          {props.fallback}
        </Avatar>
      </button>

      {props.loading ? (
        <div
          className={cn(
            "absolute inset-0 grid place-items-center",
            radiusClass,
            "bg-background/40 backdrop-blur-[1px]",
          )}
        >
          <LoaderOne />
        </div>
      ) : null}

      {canRemove ? (
        <Button
          aria-label={props.removeAriaLabel}
          shape="circle"
          size="small"
          danger
          type="primary"
          autoInsertSpace={false}
          disabled={isBusy}
          icon={<Trash2 className="size-3.5" aria-hidden="true" />}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            props.onRemove?.();
          }}
          className="absolute -bottom-1 -right-1 shadow-sm"
        />
      ) : null}
    </div>
  );
}
