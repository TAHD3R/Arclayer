import { createLazyFileRoute } from "@tanstack/react-router";

import { WorkspaceEditorHandoffPage } from "@/pages/workspaces/editor/handoff/page";

export const Route = createLazyFileRoute("/w/$workspaceId/editor/$editorMode/$entityId")({
  component: WorkspaceEditorHandoffPage,
});
