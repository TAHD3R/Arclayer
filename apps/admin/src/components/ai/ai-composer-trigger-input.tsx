import { ComposerPrimitive, useAui } from "@assistant-ui/react";
import { forwardRef, type ComponentProps } from "react";

type AIComposerTriggerInputProps = ComponentProps<typeof ComposerPrimitive.Input>;

export const AIComposerTriggerInput = forwardRef<HTMLTextAreaElement, AIComposerTriggerInputProps>(
  function AIComposerTriggerInput({ onKeyDown, ...props }, ref) {
    const aui = useAui();

    return (
      <ComposerPrimitive.Input
        {...props}
        ref={ref}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (event.defaultPrevented || event.isPropagationStopped()) return;

          const input = event.currentTarget;
          const selectionStart = input.selectionStart;
          const selectionEnd = input.selectionEnd;
          if (
            event.key !== "Backspace" ||
            event.nativeEvent.isComposing ||
            input.getAttribute("aria-expanded") !== "true" ||
            selectionStart === null ||
            selectionStart !== selectionEnd ||
            selectionStart === 0 ||
            input.value[selectionStart - 1] !== "@"
          )
            return;

          event.preventDefault();
          const nextCursorPosition = selectionStart - 1;
          aui
            .composer()
            .setText(input.value.slice(0, nextCursorPosition) + input.value.slice(selectionStart));
          requestAnimationFrame(() => {
            input.setSelectionRange(nextCursorPosition, nextCursorPosition);
          });
        }}
      />
    );
  },
);
