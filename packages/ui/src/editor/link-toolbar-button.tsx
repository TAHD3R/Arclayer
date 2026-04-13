"use client";

import * as React from "react";

import { useLinkToolbarButton, useLinkToolbarButtonState } from "@platejs/link/react";
import { Link2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ToolbarButton, ToolbarTooltip } from "./ui/toolbar";

export function LinkToolbarButton(props: React.ComponentProps<typeof ToolbarButton>) {
  const { t } = useTranslation("content");
  const state = useLinkToolbarButtonState();
  const { props: buttonProps } = useLinkToolbarButton(state);

  return (
    <ToolbarTooltip tooltip={props.tooltip ?? t("CONTENT_LIBRARY_EDITOR_MARK_LINK")}>
      <ToolbarButton
        {...props}
        {...buttonProps}
        pressed={state.pressed}
        data-plate-focus
        tooltip={undefined}
      >
        <Link2 />
      </ToolbarButton>
    </ToolbarTooltip>
  );
}
