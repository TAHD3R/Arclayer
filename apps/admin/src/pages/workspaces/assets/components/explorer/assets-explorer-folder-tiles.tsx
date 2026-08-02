import type React from "react";
import { forwardRef } from "react";
import { Folder } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@arclayer/lib/utils";

import type { AdminAssetFolderOut as AdminAssetFolder } from "@arclayer/openapi";

export function AssetsExplorerFolderUpTile(props: {
  label: string;
  onClick: () => void;
  onDoubleClick: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      data-folder-tile="true"
      className={cn(
        "group relative w-full overflow-hidden border border-border/50 bg-card",
        "rounded-lg  transition duration-200 hover:",
        "cursor-pointer outline-none select-none",
      )}
      onClick={(event) => {
        props.onClick();
        if (event.detail < 2) return;
        props.onDoubleClick();
      }}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        props.onDoubleClick();
      }}
    >
      <div className="relative w-full overflow-hidden" style={{ aspectRatio: 4 / 3 }}>
        <div className="absolute inset-0 grid place-items-center bg-linear-to-b from-primary/25 via-transparent to-transparent">
          <div className="font-bold text-label-secondary">{props.label}</div>
        </div>
      </div>
    </div>
  );
}

export const AssetsExplorerFolderTile = forwardRef<
  HTMLDivElement,
  {
    folder: AdminAssetFolder;
    folderLabel: string;
    focused?: boolean;
    isOver?: boolean;
    onClick: () => void;
    onDoubleClick: () => void;
    onContextMenu?: (e: React.MouseEvent<HTMLDivElement>) => void;
    className?: string;
    rootProps?: Omit<
      React.HTMLAttributes<HTMLDivElement>,
      "onClick" | "onDoubleClick" | "onKeyDown" | "onContextMenu" | "className" | "children"
    >;
  }
>(function AssetsExplorerFolderTile(props, ref) {
  const focused = Boolean(props.focused);
  const isOver = Boolean(props.isOver);
  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      data-folder-tile="true"
      className={cn(
        "group relative w-full overflow-hidden border border-border/50 bg-card",
        "rounded-lg  transition duration-200 hover:",
        "cursor-pointer outline-none",
        "select-none",
        focused ? "ring-1 ring-foreground/60" : null,
        isOver ? "ring-1 ring-foreground/60" : null,
        props.className,
      )}
      {...props.rootProps}
      onClick={(event) => {
        props.onClick();
        if (event.detail < 2) return;
        props.onDoubleClick();
      }}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        props.onDoubleClick();
      }}
      onContextMenu={(e) => props.onContextMenu?.(e)}
    >
      <div className="relative w-full overflow-hidden" style={{ aspectRatio: 4 / 3 }}>
        <div className="absolute inset-0 bg-muted/10">
          <div className="absolute inset-0 bg-linear-to-b from-primary/25 via-transparent to-transparent" />
          <div className="relative flex h-full flex-col justify-between p-4">
            <div className="flex items-center gap-2 ">
              <Folder size={18} className="opacity-80" />
              <span className="text-title3 font-bold ">{props.folderLabel}</span>
            </div>
            <div className="min-w-0">
              <div className="font-semibold truncate" title={props.folder.name}>
                {props.folder.name}
              </div>
              {props.folder.description ? (
                <div
                  className="mt-1 line-clamp-2 text-footnote  text-label-secondary/80"
                  title={props.folder.description}
                >
                  {props.folder.description}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

export function AssetsExplorerFolderDragOverlay(props: {
  folderName: string;
  folderLabel: string;
}) {
  return (
    <motion.div
      className="relative inline-block pointer-events-none select-none"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 0.72, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.12, ease: "easeOut" }}
      style={{ willChange: "transform", width: 156, height: 104 }}
    >
      <div className="absolute inset-0 overflow-hidden rounded-lg border border-border bg-card">
        <div className="absolute inset-0 bg-muted/10" />
        <div className="relative flex h-full flex-col justify-between p-3">
          <div className="flex items-center gap-2 text-label-secondary">
            <Folder size={18} className="opacity-80" />
            <span className="text-footnote ">{props.folderLabel}</span>
          </div>
          <div className="min-w-0">
            <div className="font-semibold truncate" title={props.folderName}>
              {props.folderName}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
