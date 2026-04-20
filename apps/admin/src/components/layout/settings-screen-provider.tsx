import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ElementType,
  type ReactNode,
  type RefObject,
} from "react";

import { cn } from "@arclayer/lib/utils";

import {
  DEFAULT_SETTINGS_SCREEN,
  type SettingsScreen,
  type SettingsScreenPayload,
  type SettingsScreenState,
  type SettingsSectionTarget,
} from "@/lib/settings/settings-screen";

type OpenSettingsOptions = SettingsSectionTarget;

type SettingsSectionTargetOptions = {
  payloadMatches?: (payload: SettingsScreenPayload | undefined) => boolean;
};

type SettingsScreenController = {
  state: SettingsScreenState;
  openSettings: (options: OpenSettingsOptions) => void;
  closeSettings: () => void;
  switchSettingsScreen: (screen: SettingsScreen) => void;
  focusSettingsSection: (target: SettingsSectionTarget) => void;
};

const SettingsScreenContext = createContext<SettingsScreenController | null>(null);

function getFocusedElement(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.activeElement instanceof HTMLElement ? document.activeElement : null;
}

function scrollBehavior() {
  if (typeof window === "undefined") return "auto";
  if (typeof window.matchMedia !== "function") return "smooth";
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

export function SettingsScreenProvider(props: { children: ReactNode }) {
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [state, setState] = useState<SettingsScreenState>({
    open: false,
    screen: DEFAULT_SETTINGS_SCREEN,
    focusRequestId: 0,
  });

  const captureReturnFocus = useCallback(() => {
    returnFocusRef.current = getFocusedElement();
  }, []);

  const openSettings = useCallback(
    (options: OpenSettingsOptions) => {
      captureReturnFocus();
      setState((prev) => ({
        open: true,
        screen: options.screen,
        section: options.section,
        payload: options.payload,
        focusRequestId: prev.focusRequestId + 1,
      }));
    },
    [captureReturnFocus],
  );

  const closeSettings = useCallback(() => {
    setState((prev) => ({
      open: false,
      screen: prev.screen,
      focusRequestId: prev.focusRequestId + 1,
    }));

    window.setTimeout(() => {
      returnFocusRef.current?.focus();
      returnFocusRef.current = null;
    }, 0);
  }, []);

  const switchSettingsScreen = useCallback((screen: SettingsScreen) => {
    setState((prev) => ({
      open: true,
      screen,
      focusRequestId: prev.focusRequestId + 1,
    }));
  }, []);

  const focusSettingsSection = useCallback((target: SettingsSectionTarget) => {
    setState((prev) => ({
      open: true,
      screen: target.screen,
      section: target.section,
      payload: target.payload,
      focusRequestId: prev.focusRequestId + 1,
    }));
  }, []);

  const value = useMemo(
    () => ({
      state,
      openSettings,
      closeSettings,
      switchSettingsScreen,
      focusSettingsSection,
    }),
    [closeSettings, focusSettingsSection, openSettings, state, switchSettingsScreen],
  );

  return (
    <SettingsScreenContext.Provider value={value}>{props.children}</SettingsScreenContext.Provider>
  );
}

export function useSettingsScreen() {
  const context = useContext(SettingsScreenContext);
  if (!context) {
    throw new Error("useSettingsScreen must be used within SettingsScreenProvider");
  }
  return context;
}

export function useSettingsSectionTarget<TElement extends HTMLElement>(
  section: string,
  options: SettingsSectionTargetOptions = {},
): RefObject<TElement | null> {
  const ref = useRef<TElement | null>(null);
  const { state } = useSettingsScreen();
  const { payloadMatches } = options;

  useEffect(() => {
    if (!state.open || state.section !== section) return;
    if (payloadMatches && !payloadMatches(state.payload)) return;

    const node = ref.current;
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

    const timer = window.setTimeout(() => {
      node.classList.remove("settings-section-flash");
      if (hadTabIndex && previousTabIndex !== null) {
        node.setAttribute("tabindex", previousTabIndex);
      } else {
        node.removeAttribute("tabindex");
      }
    }, 1200);

    return () => {
      window.clearTimeout(timer);
    };
  }, [payloadMatches, section, state.focusRequestId, state.open, state.payload, state.section]);

  return ref;
}

export type SettingsSectionAnchorProps<TTag extends ElementType = "div"> = Omit<
  ComponentPropsWithoutRef<TTag>,
  "ref"
> &
  SettingsSectionTargetOptions & {
    as?: TTag;
    section: string;
  };

export function SettingsSectionAnchor<TTag extends ElementType = "div">({
  section,
  payloadMatches,
  className,
  as,
  ...props
}: SettingsSectionAnchorProps<TTag>) {
  const ref = useSettingsSectionTarget<HTMLElement>(section, { payloadMatches });
  const Component = (as ?? "div") as ElementType;

  return (
    <Component
      {...props}
      ref={ref}
      data-settings-section={section}
      className={cn("rounded-[inherit]", className)}
    />
  );
}
