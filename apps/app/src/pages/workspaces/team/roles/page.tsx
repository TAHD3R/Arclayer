import { TeamRolesView } from "./components/team-roles-view";

export function TeamRolesPage(
  props: {
    workspaceIdOverride?: string | null;
    createOpen?: boolean;
    onCreateOpenChange?: (open: boolean) => void;
    embedded?: boolean;
  } = {},
) {
  return <TeamRolesView {...props} />;
}
