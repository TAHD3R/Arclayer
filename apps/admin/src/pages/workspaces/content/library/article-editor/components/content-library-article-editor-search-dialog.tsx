import * as React from "react";

import { ChevronDownIcon, ChevronUpIcon, SearchIcon, XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";

const ARTICLE_EDITOR_SEARCH_ROOT_SELECTOR = '[aria-label="Article body"]';
const ARTICLE_EDITOR_SEARCH_MATCH_HIGHLIGHT = "article-editor-search-match";
const ARTICLE_EDITOR_SEARCH_ACTIVE_HIGHLIGHT = "article-editor-search-active-match";

type CssHighlightRegistry = {
  delete: (name: string) => void;
  set: (name: string, value: unknown) => void;
};

type HighlightConstructor = new (...ranges: Range[]) => unknown;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getArticleEditorSearchRoot() {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLElement>(ARTICLE_EDITOR_SEARCH_ROOT_SELECTOR);
}

function getCssHighlightRegistry(): CssHighlightRegistry | null {
  if (typeof CSS === "undefined") return null;
  const registry = (CSS as typeof CSS & { highlights?: CssHighlightRegistry }).highlights;
  if (!registry || typeof registry.set !== "function" || typeof registry.delete !== "function") {
    return null;
  }
  return registry;
}

function getHighlightConstructor(): HighlightConstructor | null {
  if (typeof window === "undefined") return null;
  const ctor = (window as Window & { Highlight?: HighlightConstructor }).Highlight;
  return typeof ctor === "function" ? ctor : null;
}

function clearSearchHighlights() {
  const registry = getCssHighlightRegistry();
  if (!registry) return;
  registry.delete(ARTICLE_EDITOR_SEARCH_MATCH_HIGHLIGHT);
  registry.delete(ARTICLE_EDITOR_SEARCH_ACTIVE_HIGHLIGHT);
}

function syncSearchHighlights(matches: Range[], activeIndex: number) {
  const registry = getCssHighlightRegistry();
  const HighlightCtor = getHighlightConstructor();
  if (!registry || !HighlightCtor) return;

  if (!matches.length) {
    clearSearchHighlights();
    return;
  }

  registry.set(ARTICLE_EDITOR_SEARCH_MATCH_HIGHLIGHT, new HighlightCtor(...matches));

  const activeMatch = activeIndex >= 0 ? matches[activeIndex] : null;
  if (activeMatch) {
    registry.set(ARTICLE_EDITOR_SEARCH_ACTIVE_HIGHLIGHT, new HighlightCtor(activeMatch));
  } else {
    registry.delete(ARTICLE_EDITOR_SEARCH_ACTIVE_HIGHLIGHT);
  }
}

function collectSearchMatches(root: HTMLElement, query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return [];

  const pattern = new RegExp(escapeRegExp(normalizedQuery), "gi");
  const matches: Range[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      const textContent = node.textContent ?? "";

      if (!parent || !textContent.trim()) {
        return NodeFilter.FILTER_REJECT;
      }

      if (
        parent.closest("[data-testid='article-editor-search-overlay']") ||
        parent.closest("[aria-hidden='true']") ||
        parent.closest("[hidden]")
      ) {
        return NodeFilter.FILTER_REJECT;
      }

      return NodeFilter.FILTER_ACCEPT;
    },
  });

  while (walker.nextNode()) {
    const currentNode = walker.currentNode;
    if (!(currentNode instanceof Text)) continue;

    const textContent = currentNode.textContent ?? "";
    pattern.lastIndex = 0;

    let result = pattern.exec(textContent);
    while (result) {
      const range = document.createRange();
      range.setStart(currentNode, result.index);
      range.setEnd(currentNode, result.index + result[0].length);
      matches.push(range);
      result = pattern.exec(textContent);
    }
  }

  return matches;
}

function focusSearchInput(input: HTMLInputElement | null) {
  if (!input || document.activeElement === input) return;
  input.focus({ preventScroll: true });
  const valueLength = input.value.length;
  input.setSelectionRange(valueLength, valueLength);
}

export function ContentLibraryArticleEditorSearchOverlay(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation(["content", "common"]);
  const [query, setQuery] = React.useState("");
  const [matchCount, setMatchCount] = React.useState(0);
  const [activeMatchIndex, setActiveMatchIndex] = React.useState(-1);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const matchesRef = React.useRef<Range[]>([]);
  const activeMatchIndexRef = React.useRef(-1);

  const currentMatchNumber = activeMatchIndex >= 0 ? activeMatchIndex + 1 : 0;
  const hasMatches = matchCount > 0;

  React.useEffect(() => {
    activeMatchIndexRef.current = activeMatchIndex;
  }, [activeMatchIndex]);

  const applyActiveMatch = React.useCallback((nextIndex: number) => {
    const nextMatch = matchesRef.current[nextIndex];
    if (!nextMatch) return;

    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(nextMatch);

    const targetElement =
      nextMatch.startContainer instanceof Element
        ? nextMatch.startContainer
        : nextMatch.startContainer.parentElement;
    targetElement?.scrollIntoView({ block: "center", inline: "nearest" });

    window.requestAnimationFrame(() => {
      focusSearchInput(inputRef.current);
    });
  }, []);

  const syncMatches = React.useCallback(
    (nextQuery: string, options?: { preserveActive?: boolean }) => {
      const normalizedQuery = nextQuery.trim();
      const root = getArticleEditorSearchRoot();

      if (!normalizedQuery || !root) {
        matchesRef.current = [];
        setMatchCount(0);
        setActiveMatchIndex(-1);
        activeMatchIndexRef.current = -1;
        window.getSelection()?.removeAllRanges();
        clearSearchHighlights();
        return;
      }

      const nextMatches = collectSearchMatches(root, normalizedQuery);
      matchesRef.current = nextMatches;
      setMatchCount(nextMatches.length);

      if (nextMatches.length === 0) {
        setActiveMatchIndex(-1);
        activeMatchIndexRef.current = -1;
        window.getSelection()?.removeAllRanges();
        clearSearchHighlights();
        return;
      }

      const preferredIndex =
        options?.preserveActive &&
        activeMatchIndexRef.current >= 0 &&
        activeMatchIndexRef.current < nextMatches.length
          ? activeMatchIndexRef.current
          : 0;

      setActiveMatchIndex(preferredIndex);
      activeMatchIndexRef.current = preferredIndex;
      syncSearchHighlights(nextMatches, preferredIndex);
      applyActiveMatch(preferredIndex);
    },
    [applyActiveMatch],
  );

  const moveToMatch = React.useCallback(
    (direction: "next" | "previous") => {
      if (!matchesRef.current.length) return;

      const offset = direction === "previous" ? -1 : 1;
      const nextIndex =
        activeMatchIndexRef.current >= 0
          ? (activeMatchIndexRef.current + offset + matchesRef.current.length) %
            matchesRef.current.length
          : 0;

      setActiveMatchIndex(nextIndex);
      activeMatchIndexRef.current = nextIndex;
      syncSearchHighlights(matchesRef.current, nextIndex);
      applyActiveMatch(nextIndex);
    },
    [applyActiveMatch],
  );

  React.useEffect(() => {
    if (!props.open) return;
    setQuery("");
    setMatchCount(0);
    setActiveMatchIndex(-1);
    activeMatchIndexRef.current = -1;
    matchesRef.current = [];
    clearSearchHighlights();
  }, [props.open]);

  React.useEffect(() => {
    if (!props.open) return;

    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      props.onOpenChange(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", handleKeyDown);
      clearSearchHighlights();
    };
  }, [props.open, props.onOpenChange]);

  React.useEffect(() => {
    if (!props.open) return;
    syncMatches(query);
  }, [props.open, query, syncMatches]);

  React.useEffect(() => {
    if (!props.open) return;
    const root = getArticleEditorSearchRoot();
    if (!root || !query.trim()) return;

    let frame = 0;
    const observer = new MutationObserver(() => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        syncMatches(query, { preserveActive: true });
      });
    });

    observer.observe(root, {
      childList: true,
      characterData: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [props.open, query, syncMatches]);

  if (!props.open) return null;

  return (
    <div className="pointer-events-none absolute top-full right-0 z-80 mt-4 max-w-[calc(100vw-1rem)]">
      <div
        data-testid="article-editor-search-overlay"
        className="pointer-events-auto flex w-[min(24rem,calc(100vw-2rem))] items-center overflow-hidden rounded-lg border border-border/70 bg-popover px-2 py-1"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <SearchIcon className="size-4 shrink-0 text-label-secondary" />
          <div className="relative min-w-0 flex-1">
            <Input
              ref={inputRef}
              value={query}
              aria-label={t("CONTENT_LIBRARY_EDITOR_SEARCH_LABEL")}
              placeholder={t("CONTENT_LIBRARY_EDITOR_SEARCH_LABEL")}
              className="border-0 bg-transparent px-0 pr-12 text-callout shadow-none focus-visible:ring-0"
              onChange={(event) => {
                setQuery(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                moveToMatch(event.shiftKey ? "previous" : "next");
              }}
            />
            <div
              data-testid="article-editor-search-status"
              className="pointer-events-none absolute inset-y-0 right-0 flex items-center text-footnote text-label-secondary"
            >
              {currentMatchNumber}/{matchCount}
            </div>
          </div>
        </div>

        <div className="mx-1 h-6 w-px shrink-0 bg-border/80" />

        <div className="flex items-center pr-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("CONTENT_LIBRARY_EDITOR_SEARCH_PREVIOUS")}
            disabled={!hasMatches}
            className="size-8 rounded-xl text-label-secondary hover:text-label-primary"
            onClick={() => moveToMatch("previous")}
          >
            <ChevronUpIcon className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("CONTENT_LIBRARY_EDITOR_SEARCH_NEXT")}
            disabled={!hasMatches}
            className="size-8 rounded-xl text-label-secondary hover:text-label-primary"
            onClick={() => moveToMatch("next")}
          >
            <ChevronDownIcon className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("common:CANCEL")}
            className="size-8 rounded-xl text-label-secondary hover:text-label-primary"
            onClick={() => props.onOpenChange(false)}
          >
            <XIcon className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export { ContentLibraryArticleEditorSearchOverlay as ContentLibraryArticleEditorSearchDialog };
