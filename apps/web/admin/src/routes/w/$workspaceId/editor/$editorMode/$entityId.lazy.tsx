import { createLazyFileRoute } from "@tanstack/react-router";

import { WorkspaceEditorPage } from "@/pages/workspaces/editor/page";

export const Route = createLazyFileRoute("/w/$workspaceId/editor/$editorMode/$entityId")({
  component: WorkspaceEditorPage,
});
