import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { AdminCommandItem } from "@/lib/command/nav-command-items";
import { cn } from "@celestial/lib/utils";
import { Button as ButtonPrimitive } from "@celestial/ui/button-primitive";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@celestial/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@celestial/ui/dialog";
import { Kbd } from "@celestial/ui/kbd";

const MODIFIER_KEY = "k";

function isTextInputTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;

  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select";
}

export function AdminCommandTrigger(props: {
  items: readonly AdminCommandItem[];
  className?: string;
}) {
  const { t } = useTranslation("command");
  const [open, setOpen] = useState(false);

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
      <ButtonPrimitive
        type="button"
        tapScale={1}
        aria-label={t("COMMAND_TRIGGER_ARIA_LABEL")}
        onClick={() => setOpen(true)}
        className={cn(
          "group flex h-10 w-full items-center gap-3 rounded-xl border border-border/60",
          "bg-accent px-3.5 text-left text-footnote text-label-secondary",
          "transition-[border-color,background-color,color] duration-200",
          "hover:bg-background/80 hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          props.className,
        )}
      >
        <Search className="size-4 shrink-0 opacity-75 transition-opacity group-hover:opacity-100" />
        <span className="min-w-0 flex-1 truncate">{t("COMMAND_TRIGGER_LABEL")}</span>
        <Kbd className="ml-auto hidden shrink-0 bg-background/70 text-label-secondary sm:inline-flex">
          {t("COMMAND_TRIGGER_SHORTCUT")}
        </Kbd>
      </ButtonPrimitive>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="overflow-hidden border-border/70 p-0 sm:max-w-2xl">
          <DialogHeader className="sr-only border-0 p-0">
            <DialogTitle>{t("COMMAND_DIALOG_TITLE")}</DialogTitle>
            <DialogDescription>{t("COMMAND_DIALOG_DESCRIPTION")}</DialogDescription>
          </DialogHeader>

          <Command className="bg-popover text-popover-foreground">
            <CommandInput placeholder={t("COMMAND_INPUT_PLACEHOLDER")} />
            <CommandList className="max-h-[26rem]">
              <CommandEmpty>{t("COMMAND_EMPTY")}</CommandEmpty>
              <CommandGroup heading={t("COMMAND_GROUP_NAVIGATION")}>
                {props.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <CommandItem
                      key={item.id}
                      value={[item.title, item.description, ...item.keywords].join(" ")}
                      onSelect={() => {
                        setOpen(false);
                        item.onSelect();
                      }}
                      className="items-start gap-3 rounded-lg px-3 py-3"
                    >
                      {Icon ? (
                        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent/70 text-label-primary">
                          <Icon className="size-4" aria-hidden="true" />
                        </span>
                      ) : null}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-footnote font-medium text-foreground">
                          {item.title}
                        </span>
                        <span className="mt-0.5 block truncate text-caption text-label-secondary">
                          {item.description}
                        </span>
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
