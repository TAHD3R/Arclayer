import { createFileRoute, Navigate } from "@tanstack/react-router";

import {
  buildLegacyBlockRoutePath,
  resolveLegacyEntryIdFromPresentation,
} from "@/lib/presentations";
import { parseStudioEntrySearch } from "@/lib/routing/admin-handoff";

export const Route = createFileRoute("/w/$workspaceId/presentations/$presentationId/")({
  validateSearch: (search: Record<string, unknown>) => parseStudioEntrySearch(search),
  component: WorkspacePresentationEditorRoute,
});

function WorkspacePresentationEditorRoute() {
  const { workspaceId, presentationId } = Route.useParams();
  const search = Route.useSearch();
  const entryId = resolveLegacyEntryIdFromPresentation({ presentationId });
  const to = buildLegacyBlockRoutePath({ workspaceId, entryId });

  // Temporary compatibility shim:
  // presentation identity is the primary route contract while the editor engine
  // still runs through legacy block-entry internals.
  return <Navigate to={to} search={search} replace />;
}
