"use client";

import type { TDateElement } from "platejs";
import type { PlateElementProps } from "platejs/react";

import { PlateElement, useReadOnly } from "platejs/react";

import { Input } from "@arclayer/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@arclayer/ui/popover";
import { cn } from "@arclayer/lib/utils";

function formatDateLabel(value?: string) {
  if (!value) return "Pick a date";

  const today = new Date();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const sameDay = (left: Date, right: Date) =>
    left.getDate() === right.getDate() &&
    left.getMonth() === right.getMonth() &&
    left.getFullYear() === right.getFullYear();

  if (sameDay(date, today)) return "Today";

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(date, yesterday)) return "Yesterday";

  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (sameDay(date, tomorrow)) return "Tomorrow";

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function DateElement(props: PlateElementProps<TDateElement>) {
  const { editor, element } = props;
  const readOnly = useReadOnly();

  const trigger = (
    <span
      className={cn(
        "inline-flex w-fit cursor-pointer rounded-sm bg-muted px-1.5 py-0.5 text-sm text-muted-foreground",
      )}
      contentEditable={false}
      draggable
    >
      {formatDateLabel(element.date)}
    </span>
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
      <Popover>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent align="start" className="w-56 p-3">
          <Input
            autoFocus
            type="date"
            value={element.date ? new Date(element.date).toISOString().slice(0, 10) : ""}
            onChange={(event) => {
              const path = editor.api.findPath(element);
              if (!path) return;
              const value = event.target.value
                ? new Date(event.target.value).toISOString()
                : undefined;
              editor.tf.setNodes({ date: value }, { at: path });
            }}
          />
        </PopoverContent>
      </Popover>
      {props.children}
    </PlateElement>
  );
}
