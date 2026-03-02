import { TeamRolesView } from "./components/team-roles-view";

export function TeamRolesPage(props: { workspaceIdOverride?: string | null } = {}) {
  return <TeamRolesView {...props} />;
}
