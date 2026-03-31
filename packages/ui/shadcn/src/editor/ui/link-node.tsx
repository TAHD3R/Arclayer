import type { MouseEvent } from "react";

import { LinkPlugin, triggerFloatingLinkEdit, useLink } from "@platejs/link/react";
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

    const focusPoint = editor.api.start(path) ?? editor.api.end(path);
    if (!focusPoint) return;

    editor.tf.select(focusPoint);
    editor.tf.focus({ at: focusPoint });
    window.requestAnimationFrame(() => {
      editor.getApi(LinkPlugin).floatingLink.show("edit", editor.id);
      triggerFloatingLinkEdit(editor);
    });
  };
  const anchorProps = {
    ...linkProps,
    onMouseOver: (event: MouseEvent<HTMLAnchorElement>) => {
      linkProps.onMouseOver?.(event);
      if (readOnly) return;
      openLinkToolbar();
    },
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
      openLinkToolbar();
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
