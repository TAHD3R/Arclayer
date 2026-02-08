"use client";

import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";

import type { AdminNavItem } from "@/constants/admin-nav";
import { cn } from "@/lib/utils";
import { FloatingPanelButton } from "@/components/ui/floating-panel";
import { Kbd } from "@/components/ui/kbd";

const TRANSITION = {
  type: "spring" as const,
  bounce: 0.1,
  duration: 0.4,
};

function divider() {
  return <div className="h-px bg-border/60" />;
}

type RouteEntry = {
  to: string;
  label: string;
  icon: AdminNavItem["icon"];
};

function flattenRoutes(items: readonly AdminNavItem[], t: (key: string) => string): RouteEntry[] {
  const out: RouteEntry[] = [];

  const walk = (nodes: readonly AdminNavItem[]) => {
    for (const node of nodes) {
      const label = node.labelKey ? t(node.labelKey) : node.label;
      if (node.to) out.push({ to: node.to, label, icon: node.icon });
      if (node.children?.length) walk(node.children);
    }
  };

  walk(items);
  return out;
}

export function CommandMenu01(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enableHotkey?: boolean;
  navItems: readonly AdminNavItem[];
}) {
  const enableHotkey = props.enableHotkey ?? true;
  const { t } = useTranslation("command");
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!enableHotkey) return;

    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        props.onOpenChange(!props.open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [enableHotkey, props.onOpenChange, props.open]);

  useEffect(() => {
    if (!props.open) {
      setQuery("");
      return;
    }

    // Focus after the panel is mounted.
    const raf = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(raf);
  }, [props.open]);

  useEffect(() => {
    if (!props.open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") props.onOpenChange(false);
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [props.onOpenChange, props.open]);

  const routes = useMemo(() => flattenRoutes(props.navItems, t), [props.navItems, t]);

  const filteredRoutes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return routes;
    return routes.filter(
      (r) => r.label.toLowerCase().includes(q) || r.to.toLowerCase().includes(q),
    );
  }, [query, routes]);

  const menuItemClassName = cn(
    "group",
    "transition-colors",
    "hover:bg-primary hover:text-primary-foreground",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
  );

  return (
    <MotionConfig transition={TRANSITION}>
      <AnimatePresence>
        {props.open ? (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/10 dark:bg-black/20"
              initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
              animate={{ opacity: 1, backdropFilter: "blur(4px)" }}
              exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
              onMouseDown={() => props.onOpenChange(false)}
            />

            <motion.div
              className={cn(
                "fixed z-50 left-1/2 top-1/2 w-[560px] max-w-[calc(100vw-24px)]",
                "-translate-x-1/2 -translate-y-1/2",
                "overflow-hidden outline-none",
                "rounded-xl border border-border bg-popover text-popover-foreground shadow-lg",
              )}
              role="dialog"
              aria-modal="true"
              aria-label={t("CMDK_TITLE")}
              initial={{ opacity: 0, scale: 0.92, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 10 }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="px-3 py-2">
                <div className="flex items-center gap-2 rounded-md bg-background px-3 py-2 border border-border">
                  <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t("CMDK_PLACEHOLDER")}
                    className={cn(
                      "w-full bg-transparent text-sm outline-none",
                      "placeholder:text-muted-foreground",
                    )}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && filteredRoutes[0]) {
                        void navigate({ to: filteredRoutes[0].to });
                        props.onOpenChange(false);
                      }
                    }}
                  />
                </div>
              </div>

              {divider()}

              <div className="py-1 max-h-[360px] overflow-auto">
                {filteredRoutes.length ? (
                  filteredRoutes.map((route) => {
                    const Icon = route.icon;
                    return (
                      <FloatingPanelButton
                        key={route.to}
                        className={menuItemClassName}
                        onClick={() => {
                          void navigate({ to: route.to });
                          props.onOpenChange(false);
                        }}
                      >
                        <span className="inline-flex min-w-0 flex-1 items-center gap-2">
                          <Icon className="size-4 shrink-0" aria-hidden="true" />
                          <span className="min-w-0 truncate">{route.label}</span>
                        </span>
                      </FloatingPanelButton>
                    );
                  })
                ) : (
                  <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                    {t("CMDK_NO_RESULTS")}
                  </div>
                )}
              </div>

              {divider()}

              <div className="flex items-center justify-end px-3 py-2">
                <button
                  className="flex items-center gap-1 text-muted-foreground text-sm hover:text-foreground"
                  onClick={() => props.onOpenChange(false)}
                  type="button"
                >
                  <span>{t("CMDK_CLOSE")}</span>
                  <Kbd className="ml-1">Esc</Kbd>
                </button>
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </MotionConfig>
  );
}
