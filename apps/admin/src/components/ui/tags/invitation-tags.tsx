import type { ReactNode } from "react";
import { CheckCircle2, Clock, Link2Off, Timer, UserCog } from "lucide-react";

import type { OrganizationInvitation, TeamInvitation } from "@/types/api";

import { BaseTag, lucideTagIcon, type TagPresentationProps } from "./tag-base";

type SharedProps = TagPresentationProps & {
  label: ReactNode;
};

export function InvitationRoleTag(props: SharedProps) {
  return (
    <BaseTag
      icon={lucideTagIcon(UserCog)}
      className={props.className}
      textStyle={props.textStyle}
      style={{ marginInlineEnd: 0 }}
    >
      {props.label}
    </BaseTag>
  );
}

type OrganizationInvitationStatus = OrganizationInvitation["status"];
type TeamInvitationStatus = TeamInvitation["status"];

function statusToProps(status: OrganizationInvitationStatus | TeamInvitationStatus) {
  if (status === "accepted") {
    return { color: "green" as const, icon: lucideTagIcon(CheckCircle2) };
  }
  if (status === "revoked") {
    return { color: "red" as const, icon: lucideTagIcon(Link2Off) };
  }
  if (status === "expired") {
    return { color: "gold" as const, icon: lucideTagIcon(Clock) };
  }
  return { color: "blue" as const, icon: lucideTagIcon(Timer) };
}

export function InvitationStatusTag(
  props: SharedProps & { status: OrganizationInvitationStatus | TeamInvitationStatus },
) {
  const { color, icon } = statusToProps(props.status);
  return (
    <BaseTag color={color} icon={icon} className={props.className} textStyle={props.textStyle}>
      {props.label}
    </BaseTag>
  );
}
