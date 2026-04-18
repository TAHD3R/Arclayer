import { TeamMembersView } from "./components/team-members-view";

export function TeamMembersPage(props: {
  initialSearchQuery?: string;
  initialInspectMemberId?: string;
}) {
  return (
    <TeamMembersView
      initialSearchQuery={props.initialSearchQuery}
      initialInspectMemberId={props.initialInspectMemberId}
    />
  );
}
