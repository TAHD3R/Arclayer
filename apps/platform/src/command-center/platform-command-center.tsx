import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { PlatformDestination } from "@/capabilities/module-registry";
import {
  readRecentDestinations,
  recordRecentDestination,
  resolveRecentDestinations,
} from "@/command-center/recent-destinations";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";

type RecentState = Readonly<{
  destinations: readonly PlatformDestination[];
  error: boolean;
}>;

export type PlatformCommandCenterProps = Readonly<{
  destinations: readonly PlatformDestination[];
  pathname: string;
  isCatalogPartial: boolean;
  onNavigate: (path: PlatformDestination["path"]) => void;
}>;

function readRecentState(destinations: readonly PlatformDestination[]): RecentState {
  try {
    const records = readRecentDestinations(window.sessionStorage, destinations);
    return { destinations: resolveRecentDestinations(records, destinations), error: false };
  } catch {
    return { destinations: [], error: true };
  }
}

export function PlatformCommandCenter(props: PlatformCommandCenterProps) {
  const { t } = useTranslation("navigation");
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<RecentState>(() => readRecentState(props.destinations));
  const destinationByPath = useMemo(
    () => new Map(props.destinations.map((destination) => [destination.path, destination])),
    [props.destinations],
  );

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, []);

  useEffect(() => {
    const destination = destinationByPath.get(props.pathname as PlatformDestination["path"]);
    if (!destination) {
      setRecent(readRecentState(props.destinations));
      return;
    }
    try {
      const records = recordRecentDestination(
        window.sessionStorage,
        destination,
        props.destinations,
      );
      setRecent({
        destinations: resolveRecentDestinations(records, props.destinations),
        error: false,
      });
    } catch {
      setRecent({ destinations: [], error: true });
    }
  }, [destinationByPath, props.destinations, props.pathname]);

  const navigate = (destination: PlatformDestination) => {
    setOpen(false);
    props.onNavigate(destination.path);
  };

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button aria-label={t("COMMAND_OPEN")} className="gap-2" size="sm" variant="outline">
          <Search aria-hidden="true" className="size-4" />
          <span className="hidden lg:inline">{t("COMMAND_OPEN")}</span>
          <Kbd className="hidden lg:inline-flex">⌘K</Kbd>
        </Button>
      </DialogTrigger>
      <DialogContent className="overflow-hidden p-0">
        <DialogHeader className="sr-only border-0 p-0">
          <DialogTitle>{t("COMMAND_TITLE")}</DialogTitle>
          <DialogDescription>{t("COMMAND_DESCRIPTION")}</DialogDescription>
        </DialogHeader>
        {props.isCatalogPartial ? (
          <p className="border-b px-4 py-3 text-sm text-muted-foreground" role="status">
            {t("COMMAND_PARTIAL")}
          </p>
        ) : null}
        {recent.error ? (
          <p className="border-b px-4 py-3 text-sm text-muted-foreground" role="status">
            {t("COMMAND_RECENT_UNAVAILABLE")}
          </p>
        ) : null}
        <Command>
          <CommandInput placeholder={t("COMMAND_SEARCH_PLACEHOLDER")} />
          <CommandList>
            <CommandEmpty>{t("COMMAND_EMPTY")}</CommandEmpty>
            {recent.destinations.length > 0 ? (
              <CommandGroup heading={t("COMMAND_RECENT")}>
                {recent.destinations.map((destination) => (
                  <DestinationItem
                    destination={destination}
                    key={`recent:${destination.id}`}
                    onSelect={navigate}
                  />
                ))}
              </CommandGroup>
            ) : null}
            <CommandGroup heading={t("COMMAND_DESTINATIONS")}>
              {props.destinations.map((destination) => (
                <DestinationItem
                  destination={destination}
                  key={destination.id}
                  onSelect={navigate}
                />
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function DestinationItem(props: {
  destination: PlatformDestination;
  onSelect: (destination: PlatformDestination) => void;
}) {
  const { t } = useTranslation("navigation");
  const Icon = props.destination.icon;
  return (
    <CommandItem
      onSelect={() => props.onSelect(props.destination)}
      value={`${t(props.destination.labelKey)} ${props.destination.path}`}
    >
      <Icon aria-hidden="true" />
      <span>{t(props.destination.labelKey)}</span>
    </CommandItem>
  );
}
