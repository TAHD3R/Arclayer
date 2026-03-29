import type { MouseEvent } from "react";

import { triggerFloatingLinkEdit, useLink } from "@platejs/link/react";
import type { TLinkElement } from "platejs";
import type { PlateElementProps } from "platejs/react";

import { PlateElement, useEditorRef, useReadOnly } from "platejs/react";

export function LinkElement(props: PlateElementProps) {
  const element = props.element as TLinkElement;
  const editor = useEditorRef();
  const readOnly = useReadOnly();
  const { props: linkProps } = useLink({ element });
  const openLinkToolbar = () => {
    const path = editor.api.findPath(element);
    if (!path) return;

    const point = editor.api.end(path);
    if (!point) return;

    editor.tf.select({ anchor: point, focus: point });
    editor.tf.focus({ at: point });
    window.requestAnimationFrame(() => {
      (
        editor.api as typeof editor.api & {
          floatingLink?: { show: (mode: "edit" | "insert", editorId: string) => void };
        }
      ).floatingLink?.show("edit", editor.id);
      triggerFloatingLinkEdit(editor);
    });
  };
  const anchorProps = {
    ...linkProps,
    onPointerEnter: () => {
      if (readOnly) return;
      openLinkToolbar();
    },
    onMouseEnter: () => {
      if (readOnly) return;
      openLinkToolbar();
    },
    onMouseDown: (event: MouseEvent<HTMLAnchorElement>) => {
      if (readOnly) return;

      event.preventDefault();
      event.stopPropagation();
      openLinkToolbar();
    },
    onClick: (event: MouseEvent<HTMLAnchorElement>) => {
      if (readOnly) return;
      event.preventDefault();
      event.stopPropagation();
    },
    onFocus: () => {
      if (readOnly) return;
      openLinkToolbar();
    },
  };

  return (
    <PlateElement
      {...props}
      as="a"
      className="rounded-sm text-primary underline decoration-primary/35 underline-offset-4 transition-colors hover:text-primary/80"
      {...(anchorProps as React.ComponentProps<"a">)}
    />
  );
}
