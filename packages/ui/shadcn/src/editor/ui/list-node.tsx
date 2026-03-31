"use client";

import * as React from "react";

import { Checkbox } from "@arclayer/ui/checkbox";
import { cn } from "@arclayer/lib/utils";
import { isOrderedList } from "@platejs/list";
import { useTodoListElement, useTodoListElementState } from "@platejs/list/react";
import type { TElement } from "platejs";
import type { PlateElementProps } from "platejs/react";
import { PlateElement } from "platejs/react";

type TodoListElement = TElement & {
  checked?: boolean;
  listStart?: number;
  listStyleType?: string;
};

export function ListItemElement(props: PlateElementProps<TodoListElement>) {
  const { element } = props;
  const isTodo = typeof element.checked === "boolean";
  const todoState = useTodoListElementState({ element });
  const { checkboxProps } = useTodoListElement(todoState);

  if (!isTodo) {
    return <PlateElement as="li" {...props} />;
  }

  return (
    <PlateElement as="li" {...props} className={cn("list-none", props.className)}>
      <div className="flex items-start gap-2">
        <Checkbox
          checked={checkboxProps.checked}
          className="mt-1 border-border/80 data-[state=checked]:border-primary"
          onCheckedChange={checkboxProps.onCheckedChange}
          onMouseDown={checkboxProps.onMouseDown}
        />
        <div className="min-w-0 flex-1">{props.children}</div>
      </div>
    </PlateElement>
  );
}

export function BlockList(props: { children: React.ReactNode; element: TodoListElement }) {
  const { element } = props;
  const isTodo = typeof element.checked === "boolean";
  const todoState = useTodoListElementState({ element });
  const { checkboxProps } = useTodoListElement(todoState);
  const ListTag = isOrderedList(element as never) ? "ol" : "ul";

  return (
    <ListTag
      start={typeof element.listStart === "number" ? element.listStart : undefined}
      style={{
        listStyleType: element.listStyleType,
        margin: 0,
        padding: 0,
        position: "relative",
      }}
    >
      {isTodo ? (
        <li className="list-none">
          <div className="flex items-start gap-2">
            <Checkbox
              checked={checkboxProps.checked}
              className="mt-1 border-border/80 data-[state=checked]:border-primary"
              onCheckedChange={checkboxProps.onCheckedChange}
              onMouseDown={checkboxProps.onMouseDown}
            />
            <div className="min-w-0 flex-1">{props.children}</div>
          </div>
        </li>
      ) : (
        <li>{props.children}</li>
      )}
    </ListTag>
  );
}
