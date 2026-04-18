import { TeamRolesView } from "./components/team-roles-view";

export function TeamRolesPage(
  props: {
    workspaceIdOverride?: string | null;
    embedded?: boolean;
  } = {},
) {
  return <TeamRolesView {...props} />;
}
