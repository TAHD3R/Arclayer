import type { InviteDraftRow, RoleOption } from "../../types";
import { InviteRowControl } from "../invite-row-control";

export function TeamCollaborationStep(props: {
  rows: InviteDraftRow[];
  roleOptions: RoleOption[];
  disabled?: boolean;
  onEmailChange: (id: string, value: string) => void;
  onRoleCodeChange: (id: string, value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-6 py-6">
      <div className="space-y-3">
        {props.rows.map((row) => (
          <InviteRowControl
            key={row.id}
            email={row.email}
            roleCode={row.roleCode}
            roleOptions={props.roleOptions}
            error={row.error}
            disabled={props.disabled || row.status === "sent"}
            onEmailChange={(value) => props.onEmailChange(row.id, value)}
            onRoleCodeChange={(value) => props.onRoleCodeChange(row.id, value)}
          />
        ))}
      </div>
    </div>
  );
}
