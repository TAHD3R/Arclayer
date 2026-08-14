import { Command, CommandGroup, CommandItem, CommandList } from "@arclayer/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@arclayer/ui/popover";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  MoreHorizontal,
  Search,
  Sparkles,
  SquarePen,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

function MenuTriggerButton({
  label,
  buttonRef,
}: {
  label: string;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
}) {
  return (
    <button
      type="button"
      ref={buttonRef}
      data-canvas-interactive=""
      aria-label={label}
      title={label}
      className="flex size-6 items-center justify-center rounded-md text-label-secondary transition-colors hover:bg-accent hover:text-label-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <MoreHorizontal className="size-4" aria-hidden="true" />
    </button>
  );
}

/**
 * Anchor for floating cards opened from a menu row. Menu rows unmount on
 * select, so panels anchor on the menu's own trigger button.
 */
export type SitemapMenuAnchor = React.RefObject<HTMLButtonElement | null>;

function NodeMenuPopover({
  triggerLabel,
  groupLabel,
  children,
}: {
  triggerLabel: string;
  groupLabel: string;
  children: (anchor: SitemapMenuAnchor) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <MenuTriggerButton label={triggerLabel} buttonRef={triggerRef} />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-1">
        <Command shouldFilter={false}>
          <CommandList aria-label={groupLabel}>
            <CommandGroup>{children(triggerRef)}</CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function SitemapPageMenu({
  onAskAI,
  onRename,
  onAddPageBefore,
  onAddPageAfter,
  onAddSection,
  onFindInWireframe,
  onDelete,
}: {
  onAskAI: () => void;
  onRename: () => void;
  onAddPageBefore: (anchor: HTMLElement) => void;
  onAddPageAfter: (anchor: HTMLElement) => void;
  onAddSection: (anchor: HTMLElement) => void;
  onFindInWireframe: (() => void) | undefined;
  onDelete: () => void;
}) {
  const { t } = useTranslation("account");
  return (
    <NodeMenuPopover
      triggerLabel={t("CREATION_EDITOR_SITEMAP_PAGE_MENU")}
      groupLabel={t("CREATION_EDITOR_SITEMAP_PAGE_MENU")}
    >
      {(anchor) => (
        <>
          <MenuRow
            icon={Sparkles}
            label={t("CREATION_EDITOR_SITEMAP_MENU_ASK_AI")}
            onSelect={() => onAskAI()}
          />
          <MenuRow
            icon={SquarePen}
            label={t("CREATION_EDITOR_SITEMAP_MENU_RENAME")}
            onSelect={() => onRename()}
          />
          <MenuRow
            icon={ArrowLeft}
            label={t("CREATION_EDITOR_SITEMAP_MENU_ADD_PAGE_BEFORE")}
            onSelect={() => anchor.current && onAddPageBefore(anchor.current)}
          />
          <MenuRow
            icon={ArrowRight}
            label={t("CREATION_EDITOR_SITEMAP_MENU_ADD_PAGE_AFTER")}
            onSelect={() => anchor.current && onAddPageAfter(anchor.current)}
          />
          <MenuRow
            icon={ArrowDown}
            label={t("CREATION_EDITOR_SITEMAP_MENU_ADD_SECTION")}
            onSelect={() => anchor.current && onAddSection(anchor.current)}
          />
          {onFindInWireframe ? (
            <MenuRow
              icon={Search}
              label={t("CREATION_EDITOR_SITEMAP_MENU_FIND_IN_WIREFRAME")}
              onSelect={() => onFindInWireframe()}
            />
          ) : null}
          <MenuRow
            icon={Trash2}
            label={t("CREATION_EDITOR_SITEMAP_MENU_DELETE_PAGE")}
            onSelect={() => onDelete()}
            destructive
          />
        </>
      )}
    </NodeMenuPopover>
  );
}

export function SitemapSectionMenu({
  onAskAI,
  onInsertAbove,
  onInsertBelow,
  onDelete,
  editable,
}: {
  onAskAI: () => void;
  onInsertAbove: (anchor: HTMLElement) => void;
  onInsertBelow: (anchor: HTMLElement) => void;
  onDelete: () => void;
  editable: boolean;
}) {
  const { t } = useTranslation("account");
  return (
    <NodeMenuPopover
      triggerLabel={t("CREATION_EDITOR_SITEMAP_SECTION_MENU")}
      groupLabel={t("CREATION_EDITOR_SITEMAP_SECTION_MENU")}
    >
      {(anchor) => (
        <>
          <MenuRow
            icon={Sparkles}
            label={t("CREATION_EDITOR_SITEMAP_MENU_ASK_AI")}
            onSelect={() => onAskAI()}
          />
          <MenuRow
            icon={ArrowUp}
            label={t("CREATION_EDITOR_SITEMAP_MENU_INSERT_ABOVE")}
            onSelect={() => anchor.current && onInsertAbove(anchor.current)}
          />
          <MenuRow
            icon={ArrowDown}
            label={t("CREATION_EDITOR_SITEMAP_MENU_INSERT_BELOW")}
            onSelect={() => anchor.current && onInsertBelow(anchor.current)}
          />
          {editable ? (
            <MenuRow
              icon={Trash2}
              label={t("CREATION_EDITOR_SITEMAP_MENU_DELETE_SECTION")}
              onSelect={() => onDelete()}
              destructive
            />
          ) : null}
        </>
      )}
    </NodeMenuPopover>
  );
}

function MenuRow({
  icon: Icon,
  label,
  onSelect,
  destructive,
}: {
  icon: LucideIcon;
  label: string;
  onSelect: () => void;
  destructive?: boolean;
}) {
  return (
    <CommandItem
      value={label}
      onSelect={() => onSelect()}
      className={
        destructive
          ? "text-destructive [&_[data-command-item-indicator]]:text-destructive"
          : undefined
      }
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </CommandItem>
  );
}
