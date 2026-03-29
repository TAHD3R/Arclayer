import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { CommandEntry, CommandSection } from "@/lib/command/command-types";
import { UserAvatar } from "@/components/common/entity-avatar";
import { AdminFullLogo } from "@/components/layout/admin-logo";
import { useClientPlatform } from "@arclayer/hooks/use-client-platform";
import { cn } from "@arclayer/lib/utils";
import { Button as ButtonPrimitive } from "@arclayer/ui/button-primitive";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@arclayer/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@arclayer/ui/dialog";
import { Kbd, KbdGroup } from "@arclayer/ui/kbd";
const MODIFIER_KEY = "k";
const TRANSITION_CLASSNAME = cn(
  "transition-[color,background-color,border-color,box-shadow,opacity] duration-200 ease-[cubic-bezier(0.25,1,0.5,1)]",
  "motion-reduce:transition-none",
);

function isTextInputTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select";
}

function getShortcutKeys(platform: ReturnType<typeof useClientPlatform>): readonly string[] {
  return platform === "mac" ? ["⌘", "K"] : ["Ctrl", "K"];
}

function ShortcutKeys(props: {
  platform: ReturnType<typeof useClientPlatform>;
  className?: string;
  keyClassName?: string;
}) {
  return (
    <KbdGroup className={cn("items-center", props.className)}>
      {getShortcutKeys(props.platform).map((key) => (
        <Kbd
          key={key}
          className={cn(
            "h-6 min-w-6 rounded-md border border-transparent px-2.5 text-caption font-semibold ",
            props.keyClassName,
          )}
        >
          {key}
        </Kbd>
      ))}
    </KbdGroup>
  );
}

function EntryShortcut(props: { shortcut: readonly string[] }) {
  return (
    <KbdGroup className="hidden shrink-0 gap-1.5 sm:inline-flex">
      {props.shortcut.map((key) => (
        <Kbd
          key={key}
          className="h-5 min-w-5 rounded-[6px] border border-border/50 bg-card/70 px-2 text-caption font-semibold text-label-secondary"
        >
          {key}
        </Kbd>
      ))}
    </KbdGroup>
  );
}

function CommandTriggerButton(props: {
  open: boolean;
  platform: ReturnType<typeof useClientPlatform>;
  label: string;
  ariaLabel: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <ButtonPrimitive
      type="button"
      tapScale={1}
      aria-label={props.ariaLabel}
      onClick={props.onClick}
      data-state={props.open ? "open" : "closed"}
      className={cn(
        "group flex h-8 w-full items-center gap-3 rounded-lg border border-border/50",
        "bg-muted/85 px-3 text-left text-footnote text-label-secondary ",
        TRANSITION_CLASSNAME,
        "hover:bg-accent/70 hover:text-label-primary",
        "data-[state=open]:bg-accent data-[state=open]:text-label-primary",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        props.className,
      )}
    >
      <Search
        className={cn(
          "size-4 shrink-0 opacity-70",
          TRANSITION_CLASSNAME,
          "group-hover:opacity-100 group-hover:text-label-primary",
          "group-data-[state=open]:opacity-100 group-data-[state=open]:text-label-primary",
        )}
      />
      <span className="min-w-0 flex-1 truncate">{props.label}</span>
      <ShortcutKeys
        platform={props.platform}
        className={cn("ml-auto hidden shrink-0 gap-1.5 sm:inline-flex", TRANSITION_CLASSNAME)}
        keyClassName={cn(
          "bg-card/60 text-label-tertiary",
          TRANSITION_CLASSNAME,
          "group-hover:bg-card/72 group-hover:text-label-secondary",
          "group-data-[state=open]:bg-card/84 group-data-[state=open]:text-label-primary",
        )}
      />
    </ButtonPrimitive>
  );
}

function CommandResultItem(props: { item: CommandEntry; onSelect: () => void }) {
  const Icon = props.item.icon;

  return (
    <CommandItem
      value={[props.item.title, props.item.subtitle, props.item.meta, ...props.item.keywords].join(
        " ",
      )}
      onSelect={props.onSelect}
      className={cn(
        "group/item items-start gap-3 rounded-xl border border-transparent px-3 py-3.5",
        "transition-[background-color,border-color,color,transform] duration-200 ease-out",
        "data-[selected=true]:border-border/60 data-[selected=true]:bg-accent/55 data-[selected=true]:text-label-primary",
      )}
    >
      {props.item.avatar ? (
        <UserAvatar
          name={props.item.avatar.name}
          assetRef={props.item.avatar.assetRef}
          size={36}
          className="mt-0.5 ring-border/60"
        />
      ) : Icon ? (
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-card/55 text-label-primary transition-[background-color,color] duration-200 group-data-[selected=true]/item:bg-card/80 group-data-[selected=true]/item:text-label-primary">
          <Icon className="size-4" aria-hidden="true" />
        </span>
      ) : null}

      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-3">
          <span className="min-w-0 flex-1 truncate text-footnote font-semibold text-label-primary">
            {props.item.title}
          </span>
          {props.item.shortcut?.length ? <EntryShortcut shortcut={props.item.shortcut} /> : null}
        </span>
        <span className="mt-1 flex min-w-0 items-center gap-2 text-caption text-label-secondary">
          <span className="min-w-0 flex-1 truncate">{props.item.subtitle}</span>
          {props.item.meta ? (
            <span className="truncate text-label-tertiary">{props.item.meta}</span>
          ) : null}
        </span>
      </span>
    </CommandItem>
  );
}

function CommandPanelFooter(props: {
  platform: ReturnType<typeof useClientPlatform>;
  prefix: string;
  suffix: string;
}) {
  return (
    <div className="flex items-center gap-2 border-t border-border/70 px-4 py-3 text-callout text-label-secondary">
      <span>{props.prefix}</span>
      <ShortcutKeys
        platform={props.platform}
        className="gap-1"
        keyClassName="h-5 min-w-5 rounded-[5px] bg-card/70 px-2 text-callout text-label-secondary"
      />
      <span>{props.suffix}</span>
      <AdminFullLogo
        to="/"
        ariaLabel="Arclayer"
        width={72}
        className="ml-auto h-4 shrink-0 opacity-70 transition-opacity hover:opacity-100"
        imgClassName="h-4 w-auto"
      />
    </div>
  );
}

export function AdminCommandTrigger(props: {
  sections: readonly CommandSection[];
  query: string;
  onQueryChange: (query: string) => void;
  emptyText: string;
  onSelectEntry: (entry: CommandEntry) => void;
  className?: string;
}) {
  const { t } = useTranslation("command");
  const [open, setOpen] = useState(false);
  const platform = useClientPlatform();
  const visibleSections = useMemo(
    () => props.sections.filter((section) => section.loading || section.entries.length > 0),
    [props.sections],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== MODIFIER_KEY) return;
      if (!(event.metaKey || event.ctrlKey)) return;
      if (isTextInputTarget(event.target)) return;
      event.preventDefault();
      setOpen(true);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <CommandTriggerButton
        open={open}
        platform={platform}
        label={t("COMMAND_TRIGGER_LABEL")}
        ariaLabel={t("COMMAND_TRIGGER_ARIA_LABEL")}
        onClick={() => setOpen(true)}
        className={props.className}
      />

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) props.onQueryChange("");
        }}
      >
        <DialogContent
          showCloseButton={false}
          className={cn(
            "self-start overflow-hidden border-border/70 p-0",
            "mt-3 w-[min(40rem,calc(100vw-1.5rem))] max-w-[calc(100vw-1.5rem)] rounded-2xl bg-popover ",
          )}
        >
          <DialogHeader className="sr-only border-0 p-0">
            <DialogTitle>{t("COMMAND_DIALOG_TITLE")}</DialogTitle>
            <DialogDescription>{t("COMMAND_DIALOG_DESCRIPTION")}</DialogDescription>
          </DialogHeader>

          <Command
            shouldFilter={false}
            className={cn(
              "bg-popover text-popover-foreground",
              "[&_[cmdk-input-wrapper]]:h-14 [&_[cmdk-input-wrapper]]:gap-2.5 [&_[cmdk-input-wrapper]]:border-b [&_[cmdk-input-wrapper]]:border-border/70 [&_[cmdk-input-wrapper]]:px-4",
              "[&_[cmdk-input-wrapper]]:bg-popover [&_[cmdk-input-wrapper]_svg]:mr-0 [&_[cmdk-input-wrapper]_svg]:size-5 [&_[cmdk-input-wrapper]_svg]:text-label-secondary [&_[cmdk-input-wrapper]_svg]:opacity-100",
              "[&_[cmdk-input]]:h-14 [&_[cmdk-input]]:py-0 [&_[cmdk-input]]:text-headline [&_[cmdk-input]]:font-medium [&_[cmdk-input]]:placeholder:text-label-secondary",
              "[&_[cmdk-list]]:max-h-[35rem] [&_[cmdk-list]]:px-3 [&_[cmdk-list]]:py-2",
              "[&_[cmdk-group]]:p-0 [&_[cmdk-group-heading]]:px-1 [&_[cmdk-group-heading]]:pb-2 [&_[cmdk-group-heading]]:pt-2.5",
              "[&_[cmdk-group-heading]]:text-caption [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-label-secondary",
            )}
          >
            <CommandInput
              value={props.query}
              onValueChange={props.onQueryChange}
              placeholder={t("COMMAND_INPUT_PLACEHOLDER")}
            />
            <CommandList>
              {visibleSections.length === 0 ? (
                <div className="px-4 py-10 text-left text-footnote text-label-secondary">
                  {props.emptyText}
                </div>
              ) : null}
              {visibleSections.map((section, index) => (
                <div key={section.id}>
                  {index > 0 ? <CommandSeparator className="my-2 bg-border/60" /> : null}
                  <CommandGroup heading={section.heading}>
                    {section.entries.map((entry) => (
                      <CommandResultItem
                        key={entry.id}
                        item={entry}
                        onSelect={() => {
                          setOpen(false);
                          props.onQueryChange("");
                          props.onSelectEntry(entry);
                        }}
                      />
                    ))}
                    {section.loading && section.entries.length === 0 ? (
                      <div className="px-3 py-3 text-footnote text-label-secondary">
                        {t("COMMAND_LOADING_SEARCH")}
                      </div>
                    ) : null}
                  </CommandGroup>
                </div>
              ))}
            </CommandList>
            <CommandPanelFooter
              platform={platform}
              prefix={t("COMMAND_DIALOG_SHORTCUT_HINT_PREFIX")}
              suffix={t("COMMAND_DIALOG_SHORTCUT_HINT_SUFFIX")}
            />
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
