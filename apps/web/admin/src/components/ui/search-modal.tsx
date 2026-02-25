import { SearchIcon } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem as CommandOption,
  CommandList,
} from "@/components/ui/command";
import { Modal, ModalContent, ModalTitle, ModalTrigger } from "@/components/ui/modal";

import type { LucideIcon } from "lucide-react";

export type CommandItem = {
  id: string;
  title: string;
  description?: string;
  category?: string;
  icon?: LucideIcon;
  keywords?: string[];
  onSelect?: () => void | Promise<void>;
};

type SearchModalProps = {
  children: ReactNode;
  data: CommandItem[];
};

function normalizeSearchText(input: string | undefined): string {
  return (input || "").trim().toLowerCase();
}

function includesQuery(text: string | undefined, query: string): boolean {
  if (!text) return false;
  return normalizeSearchText(text).includes(query);
}

export function SearchModal({ children, data }: SearchModalProps) {
  const { t } = useTranslation("command");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "k" || (!event.metaKey && !event.ctrlKey)) return;
      event.preventDefault();
      setOpen((prev) => !prev);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) return data;

    return data.filter((item) => {
      if (includesQuery(item.title, normalizedQuery)) return true;
      if (includesQuery(item.description, normalizedQuery)) return true;
      if (includesQuery(item.category, normalizedQuery)) return true;
      return (item.keywords || []).some((keyword) => includesQuery(keyword, normalizedQuery));
    });
  }, [data, query]);

  const onSelectCommand = async (item: CommandItem) => {
    await item.onSelect?.();
    setOpen(false);
  };

  return (
    <Modal open={open} onOpenChange={setOpen}>
      <ModalTrigger asChild>{children}</ModalTrigger>
      <ModalContent className="p-1 sm:max-w-[560px]">
        <ModalTitle className="sr-only">{t("CMDK_TITLE")}</ModalTitle>
        <Command shouldFilter={false} className="rounded-md border bg-background">
          <CommandInput
            placeholder={t("CMDK_PLACEHOLDER")}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList className="max-h-[380px] min-h-[300px] px-2 md:px-0">
            <CommandEmpty className="flex min-h-[240px] flex-col items-center justify-center gap-2">
              <SearchIcon className="size-5 text-label-secondary" />
              <p className="text-footnote text-label-secondary">{t("CMDK_NO_RESULTS")}</p>
            </CommandEmpty>
            <CommandGroup>
              {filteredItems.map((item) => {
                const Icon = item.icon;
                return (
                  <CommandOption
                    key={item.id}
                    className="flex cursor-pointer items-center gap-3"
                    value={[item.title, item.description, item.category, ...(item.keywords || [])]
                      .filter(Boolean)
                      .join(" ")}
                    onSelect={() => {
                      void onSelectCommand(item);
                    }}
                  >
                    {Icon ? <Icon className="size-4" aria-hidden="true" /> : null}
                    <div className="min-w-0 flex flex-col">
                      <p className="truncate text-footnote font-medium">{item.title}</p>
                      {item.description ? (
                        <p className="truncate text-caption text-label-secondary">
                          {item.description}
                        </p>
                      ) : null}
                    </div>
                    {item.category ? (
                      <p className="ml-auto shrink-0 text-caption text-label-secondary">
                        {item.category}
                      </p>
                    ) : null}
                  </CommandOption>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </ModalContent>
    </Modal>
  );
}
