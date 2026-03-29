"use client";

import * as React from "react";

import type { TEquationElement } from "platejs";
import type { PlateElementProps } from "platejs/react";

import TextareaAutosize from "react-textarea-autosize";
import { useEquationElement, useEquationInput } from "@platejs/math/react";
import { BlockSelectionPlugin } from "@platejs/selection/react";
import { CornerDownLeftIcon, RadicalIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  createPrimitiveComponent,
  PlateElement,
  useEditorRef,
  useEditorSelector,
  useElement,
  useReadOnly,
  useSelected,
} from "platejs/react";

import { Button } from "@arclayer/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@arclayer/ui/popover";
import { cn } from "@arclayer/lib/utils";

const equationOptions = {
  displayMode: true,
  errorColor: "#cc0000",
  fleqn: false,
  leqno: false,
  macros: { "\\f": "#1f(#2)" },
  output: "htmlAndMathml" as const,
  strict: "warn" as const,
  throwOnError: false,
  trust: false,
};

export function EquationElement(props: PlateElementProps<TEquationElement>) {
  const selected = useSelected();
  const [open, setOpen] = React.useState(selected);
  const katexRef = React.useRef<HTMLDivElement | null>(null);

  useEquationElement({ element: props.element, katexRef, options: equationOptions });

  return (
    <PlateElement className="my-3" {...props}>
      <Popover open={open} onOpenChange={setOpen} modal={false}>
        <PopoverTrigger asChild>
          <div
            className={cn(
              "flex cursor-pointer select-none items-center justify-center rounded-xl border border-border/70 bg-muted/20 hover:bg-muted/30",
              props.element.texExpression?.length ? "px-3 py-3" : "px-4 py-5",
            )}
            contentEditable={false}
            role="button"
          >
            {props.element.texExpression?.length ? (
              <span ref={katexRef} />
            ) : (
              <div className="flex items-center gap-2 text-footnote text-label-secondary">
                <RadicalIcon className="size-5" />
                <span>Add an equation</span>
              </div>
            )}
          </div>
        </PopoverTrigger>
        <EquationPopoverContent
          isInline={false}
          open={open}
          setOpen={setOpen}
          placeholder="E = mc^2"
        />
      </Popover>
      {props.children}
    </PlateElement>
  );
}

export function InlineEquationElement(props: PlateElementProps<TEquationElement>) {
  const element = props.element;
  const katexRef = React.useRef<HTMLDivElement | null>(null);
  const selected = useSelected();
  const isCollapsed = useEditorSelector((editor) => editor.api.isCollapsed(), []);
  const [open, setOpen] = React.useState(selected && isCollapsed);

  React.useEffect(() => {
    if (selected && isCollapsed) setOpen(true);
  }, [isCollapsed, selected]);

  useEquationElement({ element, katexRef, options: equationOptions });

  return (
    <PlateElement
      {...props}
      className="mx-1 inline-block select-none rounded-sm [&_.katex-display]:my-0!"
    >
      <Popover open={open} onOpenChange={setOpen} modal={false}>
        <PopoverTrigger asChild>
          <div
            className={cn(
              "relative min-h-6 rounded-sm px-1.5 py-0.5",
              ((element.texExpression?.length ?? 0) > 0 && open) || selected
                ? "bg-brand/10"
                : "bg-muted/40",
            )}
            contentEditable={false}
          >
            <span
              ref={katexRef}
              className={cn(!(element.texExpression?.length ?? 0) && "hidden", "font-mono ")}
            />
            {!(element.texExpression?.length ?? 0) && (
              <span className="text-footnote text-label-secondary">
                <RadicalIcon className="mr-1 inline-block size-4 align-text-bottom" />
                New equation
              </span>
            )}
          </div>
        </PopoverTrigger>
        <EquationPopoverContent isInline open={open} setOpen={setOpen} placeholder="E = mc^2" />
      </Popover>
      {props.children}
    </PlateElement>
  );
}

const EquationInput = createPrimitiveComponent(TextareaAutosize)({ propsHook: useEquationInput });

function EquationPopoverContent({
  className,
  isInline,
  open,
  placeholder,
  setOpen,
}: {
  className?: string;
  isInline: boolean;
  open: boolean;
  placeholder: string;
  setOpen: (open: boolean) => void;
}) {
  const editor = useEditorRef();
  const readOnly = useReadOnly();
  const element = useElement<TEquationElement>();
  const { t } = useTranslation(["content", "common"]);
  const title = isInline
    ? t("content:CONTENT_LIBRARY_EDITOR_INSERT_INLINE_EQUATION")
    : t("content:CONTENT_LIBRARY_EDITOR_INSERT_EQUATION");
  const description = isInline
    ? t("content:CONTENT_LIBRARY_EDITOR_INSERT_INLINE_EQUATION_DESC")
    : t("content:CONTENT_LIBRARY_EDITOR_INSERT_EQUATION_DESC");

  const onClose = React.useCallback(() => {
    setOpen(false);
    if (isInline) {
      editor.tf.select(element, { focus: true, next: true });
      return;
    }
    editor.getApi(BlockSelectionPlugin).blockSelection.set(String(element.id));
  }, [editor, element, isInline, setOpen]);

  if (readOnly || !open) return null;

  return (
    <PopoverContent
      className="w-[min(36rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border/70 bg-card p-0 shadow-2xl"
      contentEditable={false}
    >
      <div className="border-b border-border/70 px-5 py-4">
        <div className="text-title3 font-semibold text-label-primary">{title}</div>
        <div className="mt-1 text-footnote text-label-secondary">{description}</div>
      </div>

      <div className="p-5">
        <EquationInput
          className={cn(
            "max-h-[40vh] min-h-32 w-full resize-none rounded-xl border border-border bg-card px-3 py-2 text-footnote outline-none",
            className,
          )}
          state={{ isInline, open, onClose }}
          autoFocus
          placeholder={placeholder}
        />
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border/70 px-5 py-4">
        <Button type="button" variant="ghost" onClick={onClose}>
          {t("common:CANCEL")}
        </Button>
        <Button type="button" variant="accent" onClick={onClose}>
          {t("common:CONFIRM")}
          <CornerDownLeftIcon className="size-3.5" />
        </Button>
      </div>
    </PopoverContent>
  );
}
