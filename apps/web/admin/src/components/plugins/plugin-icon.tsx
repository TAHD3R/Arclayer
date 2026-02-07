"use client";

import { useState } from "react";
import { Package } from "lucide-react";

import { cn } from "@/lib/utils";

export interface PluginIconProps {
  name: string;
  iconUrl?: string | null;
  size?: number;
  className?: string;
  imgClassName?: string;
  fallbackIconClassName?: string;
}

export function PluginIcon(props: PluginIconProps) {
  const [failed, setFailed] = useState(false);
  const iconUrl = (props.iconUrl || "").trim();
  const size = Number.isFinite(props.size) && (props.size as number) > 0 ? (props.size as number) : null;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-md bg-muted",
        "flex items-center justify-center",
        props.className,
      )}
      style={size ? { width: size, height: size } : undefined}
    >
      {iconUrl && !failed ? (
        <img
          src={iconUrl}
          alt={props.name}
          className={cn("h-full w-full object-cover", props.imgClassName)}
          width={size ?? 64}
          height={size ?? 64}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <Package
          className={cn("size-5 text-muted-foreground", props.fallbackIconClassName)}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
