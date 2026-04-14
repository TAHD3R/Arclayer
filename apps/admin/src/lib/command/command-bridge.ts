export type AdminCommandOpenDetail = {
  query?: string;
};

const ADMIN_COMMAND_OPEN_EVENT = "arclayer:admin-command-open";

export function openAdminCommand(detail: AdminCommandOpenDetail = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<AdminCommandOpenDetail>(ADMIN_COMMAND_OPEN_EVENT, { detail }),
  );
}

export function addAdminCommandOpenListener(listener: (detail: AdminCommandOpenDetail) => void) {
  if (typeof window === "undefined") return () => undefined;

  const onOpen = (event: Event) => {
    const detail =
      typeof CustomEvent !== "undefined" && event instanceof CustomEvent
        ? ((event.detail as AdminCommandOpenDetail | undefined) ?? {})
        : {};
    listener(detail);
  };

  window.addEventListener(ADMIN_COMMAND_OPEN_EVENT, onOpen as EventListener);
  return () => window.removeEventListener(ADMIN_COMMAND_OPEN_EVENT, onOpen as EventListener);
}
