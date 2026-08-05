"use client";

import {
  ComposerPrimitive,
  INTERNAL,
  unstable_defaultDirectiveFormatter,
  useAui,
  useAuiState,
  type Unstable_TriggerItem,
} from "@assistant-ui/react";
import {
  LexicalComposerInput,
  type DirectiveChipProps,
  type LexicalComposerInputProps,
} from "@assistant-ui/react-lexical";
import {
  BlocksIcon,
  BotIcon,
  CommandIcon,
  FileTextIcon,
  FolderIcon,
  ImageIcon,
  PaperclipIcon,
  type LucideIcon,
} from "lucide-react";
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FC,
  type PropsWithChildren,
  type Ref,
} from "react";
import { useShallow } from "zustand/shallow";

import {
  agentIdsForComposerScope,
  parseAIComposerDirectives,
  removeAIComposerDirectiveByIdentity,
  skillInstallationIdsForComposerScope,
  useAIComposerDirectiveStore,
  type AIComposerDirectiveChip,
  type AIComposerDirectiveScope,
} from "@/components/ai/ai-composer-directives";
import { AttachmentPreviewDialog } from "@/components/assistant-ui/attachment";
import { cn } from "@arclayer/lib/utils";

type DirectiveIdentity = Readonly<{ type: string; id: string }>;

type AIComposerDirectiveInsertionContextValue = Readonly<{
  insertDirective: (item: Unstable_TriggerItem) => void;
  onDirectiveInserted: (item: Unstable_TriggerItem) => void;
  removeDirective: (identity: DirectiveIdentity) => void;
  setEditorRoot: (element: HTMLDivElement | null) => void;
}>;

const AIComposerDirectiveInsertionContext =
  createContext<AIComposerDirectiveInsertionContextValue | null>(null);

export const AI_COMPOSER_DIRECTIVE_CHIP_STYLES: Readonly<Record<string, string>> = {
  attachment:
    "border-amber-500/30 bg-amber-500/12 text-amber-800 dark:border-amber-400/30 dark:bg-amber-400/12 dark:text-amber-200",
  skill:
    "border-violet-500/30 bg-violet-500/12 text-violet-800 dark:border-violet-400/30 dark:bg-violet-400/12 dark:text-violet-200",
  agent:
    "border-sky-500/30 bg-sky-500/12 text-sky-800 dark:border-sky-400/30 dark:bg-sky-400/12 dark:text-sky-200",
  project:
    "border-cyan-500/30 bg-cyan-500/12 text-cyan-800 dark:border-cyan-400/30 dark:bg-cyan-400/12 dark:text-cyan-200",
  asset:
    "border-emerald-500/30 bg-emerald-500/12 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/12 dark:text-emerald-200",
  content:
    "border-slate-500/25 bg-slate-500/10 text-slate-700 dark:border-slate-400/25 dark:bg-slate-400/10 dark:text-slate-200",
};

const DEFAULT_CHIP_STYLE = "border-border/70 bg-muted/70 text-label-primary dark:bg-muted/55";
const EMPTY_TRIGGER_BACKSPACE_PRIORITY = 100;

function shouldPreserveNativeEmptyTriggerBackspace(text: string, cursorPosition: number): boolean {
  if (cursorPosition <= 0 || cursorPosition > text.length) return false;
  const trigger = text[cursorPosition - 1];
  if (trigger !== "@" && trigger !== "/") return false;
  return cursorPosition === 1 || /\s/u.test(text[cursorPosition - 2] ?? "");
}

export function useAIComposerDirectiveInsertion() {
  const context = useContext(AIComposerDirectiveInsertionContext);
  if (!context) {
    throw new Error(
      "useAIComposerDirectiveInsertion must be used within AIComposerDirectiveInsertionProvider",
    );
  }
  return context;
}

export function insertSerializedDirectiveAtCursor(
  text: string,
  cursorPosition: number,
  directiveText: string,
): string {
  const cursor = Math.max(0, Math.min(cursorPosition, text.length));
  return `${text.slice(0, cursor)}${directiveText}${text.slice(cursor)}`;
}

export function AIComposerDirectiveInsertionProvider({
  children,
  scope,
}: PropsWithChildren<{ scope: AIComposerDirectiveScope }>) {
  const aui = useAui();
  const pluginRegistry = INTERNAL.useComposerInputPluginRegistryOptional();
  const cursorPositionRef = useRef<number | null>(null);
  const editorRootRef = useRef<HTMLDivElement | null>(null);

  if (!pluginRegistry) {
    throw new Error(
      "AIComposerDirectiveInsertionProvider must be rendered inside ComposerPrimitive.Unstable_TriggerPopoverRoot",
    );
  }

  useEffect(
    () =>
      pluginRegistry.register(
        {
          handleKeyDown: (event) => {
            if (event.key !== "Backspace" || event.nativeEvent?.isComposing) return false;
            const composerText = aui.composer().getState().text;
            const cursorPosition = cursorPositionRef.current ?? composerText.length;
            if (!shouldPreserveNativeEmptyTriggerBackspace(composerText, cursorPosition)) {
              return false;
            }

            // Consume the trigger plugin without preventing the browser's native deletion.
            // Lexical then removes the character and preserves the current caret position.
            return true;
          },
          setCursorPosition: (position) => {
            if (editorOwnsFocus(editorRootRef.current)) cursorPositionRef.current = position;
          },
        },
        { priority: EMPTY_TRIGGER_BACKSPACE_PRIORITY },
      ),
    [aui, pluginRegistry],
  );

  const onDirectiveInserted = useCallback(
    (item: Unstable_TriggerItem) => {
      const directive = toAIComposerDirectiveChip(item);
      if (!directive) return;
      useAIComposerDirectiveStore.getState().addDirectives(scope, [directive]);
      if (directive.type !== "agent" && directive.type !== "skill") return;

      const composer = aui.composer();
      const current = composer.getState().runConfig;
      composer.setRunConfig({
        ...current,
        custom: {
          ...current.custom,
          ...(directive.type === "agent"
            ? { mentionedAgentIds: [...agentIdsForComposerScope(scope)] }
            : {
                selectedSkillInstallationIds: [...skillInstallationIdsForComposerScope(scope)],
              }),
        },
      });
    },
    [aui, scope],
  );

  const focusAfterDirective = useCallback(
    (identity: DirectiveIdentity, occurrenceIndex: number) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const root = editorRootRef.current;
          const editable = root?.querySelector<HTMLElement>("[contenteditable='true']");
          if (!root || !editable) return;

          const matches = [...root.querySelectorAll<HTMLElement>("[data-directive-id]")].filter(
            (element) =>
              element.dataset.directiveId === identity.id &&
              element.dataset.directiveType === identity.type,
          );
          const chip = matches[occurrenceIndex]?.closest<HTMLElement>(
            "[data-lexical-decorator='true']",
          );
          if (!chip) return;

          editable.focus({ preventScroll: true });
          const selection = window.getSelection();
          if (!selection) return;
          const range = document.createRange();
          range.setStartAfter(chip);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
          document.dispatchEvent(new Event("selectionchange"));
        });
      });
    },
    [],
  );

  const insertDirective = useCallback(
    (item: Unstable_TriggerItem) => {
      const composer = aui.composer();
      const directiveText = unstable_defaultDirectiveFormatter.serialize(item);
      const currentText = composer.getState().text;
      const cursorPosition = Math.min(
        cursorPositionRef.current ?? currentText.length,
        currentText.length,
      );
      const occurrenceIndex = parseAIComposerDirectives(
        currentText.slice(0, cursorPosition),
      ).filter((directive) => directive.type === item.type && directive.id === item.id).length;
      const nextText = insertSerializedDirectiveAtCursor(
        currentText,
        cursorPosition,
        directiveText,
      );
      cursorPositionRef.current = cursorPosition + directiveText.length;
      composer.setText(nextText);
      onDirectiveInserted(item);
      focusAfterDirective({ type: item.type, id: item.id }, occurrenceIndex);
    },
    [aui, focusAfterDirective, onDirectiveInserted],
  );

  const removeDirective = useCallback(
    (identity: DirectiveIdentity) => {
      const composer = aui.composer();
      const currentText = composer.getState().text;
      const nextText = removeAIComposerDirectiveByIdentity(currentText, identity.type, identity.id);
      if (nextText !== currentText) composer.setText(nextText);
    },
    [aui],
  );

  const value = useMemo<AIComposerDirectiveInsertionContextValue>(
    () => ({
      insertDirective,
      onDirectiveInserted,
      removeDirective,
      setEditorRoot: (element) => {
        editorRootRef.current = element;
      },
    }),
    [insertDirective, onDirectiveInserted, removeDirective],
  );

  return (
    <AIComposerDirectiveInsertionContext.Provider value={value}>
      <AIComposerAttachmentDirectiveSync />
      {children}
    </AIComposerDirectiveInsertionContext.Provider>
  );
}

type AIComposerRichInputProps = Omit<
  LexicalComposerInputProps,
  "directiveChip" | "directivePluginProps" | "formatter" | "placeholder"
>;

export const AIComposerRichInput = forwardRef<HTMLDivElement, AIComposerRichInputProps>(
  function AIComposerRichInput({ className, onFocus, ...props }, forwardedRef) {
    const { onDirectiveInserted, setEditorRoot } = useAIComposerDirectiveInsertion();
    const [rootElement, setRootElement] = useState<HTMLDivElement | null>(null);
    const ariaLabel = props["aria-label"];

    useEffect(() => {
      const editable = rootElement?.querySelector<HTMLElement>("[contenteditable='true']");
      if (!editable) return;
      editable.setAttribute("role", "textbox");
      editable.setAttribute("aria-multiline", "true");
      if (typeof ariaLabel === "string") editable.setAttribute("aria-label", ariaLabel);
    }, [ariaLabel, rootElement]);

    return (
      <LexicalComposerInput
        {...props}
        ref={(element) => {
          setRootElement(element);
          setEditorRoot(element);
          assignRef(forwardedRef, element);
        }}
        directiveChip={AIComposerDirectiveChip}
        directivePluginProps={{ onDirectiveSelect: onDirectiveInserted }}
        formatter={unstable_defaultDirectiveFormatter}
        tabIndex={-1}
        className={cn(
          "aui-rich-composer-input relative w-full min-w-0 overflow-y-auto bg-transparent text-callout leading-relaxed text-label-primary outline-none",
          "[&_.aui-lexical-input]:min-h-full [&_.aui-lexical-input]:whitespace-pre-wrap [&_.aui-lexical-input]:outline-none",
          "[&_.aui-lexical-input]:wrap-break-word [&_.aui-lexical-placeholder]:hidden",
          className,
        )}
        onFocus={(event) => {
          if (event.target === event.currentTarget) {
            event.currentTarget.querySelector<HTMLElement>("[contenteditable='true']")?.focus();
          }
          onFocus?.(event);
        }}
      />
    );
  },
);

function AIComposerAttachmentDirectiveSync() {
  const aui = useAui();
  const attachments = useAuiState((state) => state.composer.attachments);
  const composerText = useAuiState((state) => state.composer.text);
  const { insertDirective, removeDirective } = useAIComposerDirectiveInsertion();
  const previousAttachmentIdsRef = useRef<Set<string>>(new Set());
  const pendingInsertionsRef = useRef<Set<string>>(new Set());
  const pendingRemovalsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const currentIds = new Set(attachments.map((attachment) => attachment.id));
    const directiveIds = new Set(
      parseAIComposerDirectives(composerText)
        .filter((directive) => directive.type === "attachment")
        .map((directive) => directive.id),
    );

    for (const id of pendingInsertionsRef.current) {
      if (directiveIds.has(id) || !currentIds.has(id)) pendingInsertionsRef.current.delete(id);
    }
    for (const id of pendingRemovalsRef.current) {
      if (!currentIds.has(id)) pendingRemovalsRef.current.delete(id);
    }

    const previousIds = previousAttachmentIdsRef.current;
    for (const attachment of attachments) {
      if (previousIds.has(attachment.id) || directiveIds.has(attachment.id)) continue;
      pendingInsertionsRef.current.add(attachment.id);
      insertDirective({
        id: attachment.id,
        type: "attachment",
        label: attachment.name,
      });
    }

    for (const id of previousIds) {
      if (!currentIds.has(id)) removeDirective({ type: "attachment", id });
    }

    for (const [index, attachment] of attachments.entries()) {
      if (
        directiveIds.has(attachment.id) ||
        !previousIds.has(attachment.id) ||
        pendingInsertionsRef.current.has(attachment.id) ||
        pendingRemovalsRef.current.has(attachment.id)
      ) {
        continue;
      }
      pendingRemovalsRef.current.add(attachment.id);
      void aui
        .composer()
        .attachment({ index })
        .remove()
        .finally(() => pendingRemovalsRef.current.delete(attachment.id));
    }

    previousAttachmentIdsRef.current = currentIds;
  }, [attachments, aui, composerText, insertDirective, removeDirective]);

  return null;
}

function AIComposerDirectiveChip(props: DirectiveChipProps) {
  const attachments = useAuiState((state) => state.composer.attachments);
  const attachmentIndex =
    props.directiveType === "attachment"
      ? attachments.findIndex((attachment) => attachment.id === props.directiveId)
      : -1;

  if (attachmentIndex >= 0) {
    return (
      <ComposerPrimitive.AttachmentByIndex
        index={attachmentIndex}
        components={ATTACHMENT_DIRECTIVE_COMPONENTS}
      />
    );
  }

  const Icon = directiveIcon(props.directiveType);
  return (
    <DirectiveChipSurface type={props.directiveType} id={props.directiveId}>
      <Icon className="size-[0.9em] shrink-0" aria-hidden="true" />
      <span className="min-w-0 truncate">{props.label}</span>
    </DirectiveChipSurface>
  );
}

const AttachmentDirectiveChip: FC = () => {
  const { id, isImage, name } = useAuiState(
    useShallow((state) => ({
      id: state.attachment.id,
      isImage: state.attachment.type === "image",
      name: state.attachment.name,
    })),
  );
  const content = (
    <>
      <PaperclipIcon className="size-[0.9em] shrink-0" aria-hidden="true" />
      <span className="min-w-0 truncate">{name}</span>
    </>
  );

  return (
    <DirectiveChipSurface type="attachment" id={id}>
      {isImage ? (
        <AttachmentPreviewDialog>
          <button
            type="button"
            className="inline-flex min-w-0 items-center gap-[0.3em] rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {content}
          </button>
        </AttachmentPreviewDialog>
      ) : (
        content
      )}
    </DirectiveChipSurface>
  );
};

const ATTACHMENT_DIRECTIVE_COMPONENTS = { Attachment: AttachmentDirectiveChip } as const;

function DirectiveChipSurface(props: PropsWithChildren<{ type: string; id: string }>) {
  return (
    <span
      data-ai-directive-chip
      data-directive-type={props.type}
      data-directive-id={props.id}
      className="inline-flex max-w-[min(14rem,55vw)] px-[0.25em] align-baseline"
    >
      <span
        data-ai-directive-surface
        className={cn(
          "inline-flex h-[1.45em] min-w-0 max-w-full items-center gap-[0.3em]",
          "rounded-[0.4em] border px-[0.42em] text-[0.86em] font-semibold leading-none",
          AI_COMPOSER_DIRECTIVE_CHIP_STYLES[props.type] ?? DEFAULT_CHIP_STYLE,
        )}
      >
        {props.children}
      </span>
    </span>
  );
}

function directiveIcon(type: string): LucideIcon {
  if (type === "agent") return BotIcon;
  if (type === "skill") return BlocksIcon;
  if (type === "project") return FolderIcon;
  if (type === "asset") return ImageIcon;
  if (type === "content") return FileTextIcon;
  if (type === "attachment") return PaperclipIcon;
  return CommandIcon;
}

function editorOwnsFocus(root: HTMLDivElement | null): boolean {
  const editable = root?.querySelector<HTMLElement>("[contenteditable='true']");
  return Boolean(
    editable && (editable === document.activeElement || editable.contains(document.activeElement)),
  );
}

function toAIComposerDirectiveChip(item: Unstable_TriggerItem): AIComposerDirectiveChip | null {
  if (
    item.type !== "project" &&
    item.type !== "agent" &&
    item.type !== "skill" &&
    item.type !== "attachment" &&
    item.type !== "asset" &&
    item.type !== "content" &&
    item.type !== "action"
  ) {
    return null;
  }
  const metadata = item.metadata;
  const readMetadata = (key: string) => {
    const value = metadata?.[key];
    return typeof value === "string" && value ? value : undefined;
  };
  const command = readMetadata("command");
  const previewUrl = readMetadata("previewUrl");
  const mime = readMetadata("mime");
  return {
    type: item.type,
    id: item.id,
    label: item.label,
    ...(command ? { command } : {}),
    ...(previewUrl ? { previewUrl } : {}),
    ...(mime ? { mime } : {}),
  };
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") {
    ref(value);
    return;
  }
  if (ref) ref.current = value;
}
