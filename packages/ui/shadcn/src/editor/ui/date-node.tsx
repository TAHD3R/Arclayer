"use client";

import { CalendarDaysIcon } from "lucide-react";
import type { TDateElement } from "platejs";
import type { PlateElementProps } from "platejs/react";

import { PlateElement, useReadOnly } from "platejs/react";

import { Button } from "@arclayer/ui/button";
import { Calendar } from "@arclayer/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@arclayer/ui/popover";
import { cn } from "@arclayer/lib/utils";

import { useDateNodeLocalization } from "../date-node-localization-context";

export function DateElement(props: PlateElementProps<TDateElement>) {
  const { editor, element } = props;
  const readOnly = useReadOnly();
  const localization = useDateNodeLocalization();
  const selectedDate = localization.toCalendarDate(element.date);

  const trigger = (
    <button
      type="button"
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-md border border-border/70 bg-muted/30 px-2 py-1 text-footnote font-medium text-label-secondary transition-colors hover:bg-accent/60 hover:text-label-primary",
      )}
      contentEditable={false}
    >
      <CalendarDaysIcon className="size-3.5" />
      <span>{localization.formatLabel(element.date)}</span>
    </button>
  );

  if (readOnly) {
    return (
      <PlateElement {...props} as="span" className="inline-block">
        {trigger}
        {props.children}
      </PlateElement>
    );
  }

  return (
    <PlateElement
      {...props}
      as="span"
      className="inline-block"
      attributes={{
        ...props.attributes,
        contentEditable: false,
      }}
    >
      <Popover modal={false}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            mode="single"
            locale={localization.calendarLocale}
            selected={selectedDate}
            onSelect={(date) => {
              const path = editor.api.findPath(element);
              if (!path) return;

              editor.tf.setNodes(
                { date: localization.toStoredDate(date ?? undefined) },
                { at: path },
              );
            }}
          />

          <div className="flex items-center justify-end border-t border-border/70 px-3 py-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-3 text-label-secondary hover:text-label-primary"
              onClick={() => {
                const path = editor.api.findPath(element);
                if (!path) return;

                editor.tf.setNodes({ date: undefined }, { at: path });
              }}
            >
              {localization.clearLabel}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      {props.children}
    </PlateElement>
  );
}
