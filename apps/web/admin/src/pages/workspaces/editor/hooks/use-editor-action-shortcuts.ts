import * as React from "react";

import { isEditableTarget } from "@/pages/workspaces/editor/hooks/editor-keyboard";
import { useEditorActions } from "@/pages/workspaces/editor/hooks/use-editor-actions";

function isModKey(e: KeyboardEvent): boolean {
  return Boolean(e.metaKey || e.ctrlKey);
}

export function useEditorActionShortcuts() {
  const { isEnabled, run } = useEditorActions();

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;

      const mod = isModKey(e);
      const key = e.key;
      const lower = key.toLowerCase();

      // Save
      if (mod && lower === "s") {
        e.preventDefault();
        if (isEnabled("file.save_draft")) void run("file.save_draft");
        return;
      }

      // Undo / Redo
      if (mod && lower === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          if (isEnabled("edit.redo")) void run("edit.redo");
        } else if (isEnabled("edit.undo")) {
          void run("edit.undo");
        }
        return;
      }
      // Windows-friendly Redo
      if (e.ctrlKey && !e.metaKey && lower === "y") {
        e.preventDefault();
        if (isEnabled("edit.redo")) void run("edit.redo");
        return;
      }

      // Duplicate
      if (mod && lower === "d") {
        e.preventDefault();
        if (isEnabled("edit.duplicate")) void run("edit.duplicate");
        return;
      }

      // Delete
      if (!mod && (key === "Backspace" || key === "Delete")) {
        e.preventDefault();
        if (isEnabled("edit.delete")) void run("edit.delete");
        return;
      }

      // Tool switching (V/H)
      if (!mod && lower === "v") {
        if (isEnabled("tool.select")) void run("tool.select");
        return;
      }
      if (!mod && lower === "h") {
        if (isEnabled("tool.hand")) void run("tool.hand");
        return;
      }

      // Zoom shortcuts
      if (mod && (key === "+" || key === "=")) {
        e.preventDefault();
        if (isEnabled("view.zoom_in")) void run("view.zoom_in");
        return;
      }
      if (mod && key === "-") {
        e.preventDefault();
        if (isEnabled("view.zoom_out")) void run("view.zoom_out");
        return;
      }
      if (mod && key === "0") {
        e.preventDefault();
        if (isEnabled("view.zoom_reset")) void run("view.zoom_reset");
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isEnabled, run]);
}
