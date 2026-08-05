import {
  type ComponentPropsWithoutRef,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
} from "react";
import { Link as LinkIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";
import {
  SettingItem,
  SettingItemContent,
  SettingItemDescription,
  SettingItemFooter,
  SettingItemHeader,
  SettingItemTitle,
} from "@arclayer/ui/setting-item";
import { cn } from "@arclayer/lib/utils";

import { notifyErrorText, notifySuccessText } from "@/lib/notifications";

type SystemSettingItemProps = Omit<ComponentPropsWithoutRef<typeof SettingItem>, "title"> & {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  headerAction?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  contentClassName?: string;
};

function buildDeeplink(sectionId: string): string {
  if (typeof window === "undefined") return `#${sectionId}`;
  const url = new URL(window.location.href);
  url.hash = sectionId;
  return url.toString();
}

function scrollBehavior() {
  if (typeof window === "undefined") return "auto";
  if (typeof window.matchMedia !== "function") return "smooth";
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

function focusSectionNode(sectionId: string) {
  if (typeof document === "undefined") return;
  const node = document.getElementById(sectionId);
  if (!node) return;

  const previousTabIndex = node.getAttribute("tabindex");
  const hadTabIndex = node.hasAttribute("tabindex");

  node.scrollIntoView({
    block: "center",
    inline: "nearest",
    behavior: scrollBehavior(),
  });
  if (!hadTabIndex) {
    node.setAttribute("tabindex", "-1");
  }
  node.focus({ preventScroll: true });
  node.classList.remove("settings-section-flash");
  void node.offsetWidth;
  node.classList.add("settings-section-flash");

  window.setTimeout(() => {
    node.classList.remove("settings-section-flash");
    if (hadTabIndex && previousTabIndex !== null) {
      node.setAttribute("tabindex", previousTabIndex);
    } else {
      node.removeAttribute("tabindex");
    }
  }, 1200);
}

function useHashFocus(sectionId: string) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const focusFromHash = () => {
      const hash = decodeURIComponent(window.location.hash.replace(/^#/, ""));
      if (hash !== sectionId) return;
      window.setTimeout(() => focusSectionNode(sectionId), 0);
    };

    focusFromHash();
    window.addEventListener("hashchange", focusFromHash);
    return () => window.removeEventListener("hashchange", focusFromHash);
  }, [sectionId]);
}

export function SystemSettingItem({
  id,
  title,
  description,
  headerAction,
  children,
  footer,
  className,
  contentClassName,
  ...props
}: SystemSettingItemProps) {
  const { t } = useTranslation(["settings", "assets"]);
  const descriptionId = useId();
  useHashFocus(id);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(buildDeeplink(id));
      notifySuccessText(t("assets:ASSET_LINK_COPIED"));
    } catch {
      notifyErrorText(t("assets:ASSET_COPY_LINK_FAILED"));
    }
  }, [id, t]);

  return (
    <SettingItem
      id={id}
      aria-describedby={description ? descriptionId : undefined}
      className={cn("settings-section-flash-target", className)}
      {...props}
    >
      <SettingItemHeader>
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <SettingItemTitle>{title}</SettingItemTitle>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={t("settings:SETTINGS_COPY_DEEPLINK")}
                onClick={(event) => {
                  event.stopPropagation();
                  void copyLink();
                }}
              >
                <LinkIcon className="size-4" />
              </Button>
            </div>
            {description ? (
              <SettingItemDescription id={descriptionId} className="mt-1">
                {description}
              </SettingItemDescription>
            ) : null}
          </div>
          {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
        </div>
      </SettingItemHeader>
      {children ? (
        <SettingItemContent className={contentClassName}>{children}</SettingItemContent>
      ) : null}
      {footer ? <SettingItemFooter>{footer}</SettingItemFooter> : null}
    </SettingItem>
  );
}

export function SystemSettingStack(props: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-8 pb-12", props.className)}>{props.children}</div>
  );
}

export function SystemSettingRow(props: {
  title: ReactNode;
  description?: ReactNode;
  control?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 items-start justify-between gap-4 py-2", props.className)}>
      <div className="min-w-0 flex-1">
        <div className="text-headline text-label-primary">{props.title}</div>
        {props.description ? (
          <div className="mt-1 text-label-secondary">{props.description}</div>
        ) : null}
        {props.children ? <div className="mt-3">{props.children}</div> : null}
      </div>
      {props.control ? <div className="shrink-0 pt-0.5">{props.control}</div> : null}
    </div>
  );
}

export function SystemSettingField(props: {
  label: ReactNode;
  description?: ReactNode;
  message?: ReactNode;
  children: ReactNode;
  className?: string;
  labelControls?: boolean;
}) {
  const content = (
    <>
      <span>
        <span className="block text-headline font-semibold text-label-primary">{props.label}</span>
        {props.description ? (
          <span className="mt-1 block text-label-secondary">{props.description}</span>
        ) : null}
      </span>
      <span className="pointer-events-none grid min-w-0 [&>*]:pointer-events-auto">
        {props.children}
      </span>
      {props.message}
    </>
  );

  if (props.labelControls === false) {
    return <div className={cn("grid gap-2 py-2", props.className)}>{content}</div>;
  }

  return (
    <label className={cn("pointer-events-none grid gap-2 py-2", props.className)}>{content}</label>
  );
}

export function SystemSettingInlineNote(props: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("py-2 text-footnote text-label-secondary", props.className)}>
      {props.children}
    </div>
  );
}

export function SystemSettingFooterActions(props: {
  dirty: boolean;
  pending?: boolean;
  onSave: () => void;
  onReset: () => void;
  saveLabel?: ReactNode;
  resetLabel?: ReactNode;
  hint?: ReactNode;
}) {
  const { t } = useTranslation(["settings"]);

  if (!props.dirty) return null;

  return (
    <>
      <div className="text-footnote text-label-secondary">
        {props.hint ?? t("settings:SETTINGS_UNSAVED_CHANGES")}
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="outline" disabled={props.pending} onClick={props.onReset}>
          {props.resetLabel ?? t("settings:SETTINGS_RESET")}
        </Button>
        <Button
          type="button"
          loading={props.pending}
          disabled={props.pending}
          onClick={() => props.onSave()}
        >
          {props.saveLabel ?? t("settings:SETTINGS_SAVE")}
        </Button>
      </div>
    </>
  );
}

export function useDirtyFields<TValues extends Record<string, unknown>>(
  current: TValues,
  initial: TValues,
  fields: readonly (keyof TValues)[],
) {
  return useMemo(
    () => fields.some((field) => current[field] !== initial[field]),
    [current, fields, initial],
  );
}
