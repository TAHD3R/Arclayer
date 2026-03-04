import type { ReactNode } from "react";
import { CheckCircle2, Lock, Mail, UserCog, UserRound, XCircle } from "lucide-react";

import type { TeamMember, UserStatus } from "@/types/api";

import { BaseTag, lucideTagIcon } from "./tag-base";

type SharedProps = {
  className?: string;
  label: ReactNode;
};

export function TeamRoleTag(props: SharedProps) {
  return (
    <BaseTag icon={lucideTagIcon(UserCog)} className={props.className}>
      {props.label}
    </BaseTag>
  );
}

type MembershipStatus = TeamMember["membershipStatus"];

export function TeamMembershipStatusTag(props: SharedProps & { status: MembershipStatus }) {
  const { status, label, className } = props;

  if (status === "active") {
    return (
      <BaseTag color="green" icon={lucideTagIcon(CheckCircle2)} className={className}>
        {label}
      </BaseTag>
    );
  }

  if (status === "invited") {
    return (
      <BaseTag color="blue" icon={lucideTagIcon(Mail)} className={className}>
        {label}
      </BaseTag>
    );
  }

  return (
    <BaseTag color="red" icon={lucideTagIcon(XCircle)} className={className}>
      {label}
    </BaseTag>
  );
}

export function TeamUserStatusTag(props: SharedProps & { status: UserStatus }) {
  const { status, label, className } = props;

  if (status === "active") {
    return (
      <BaseTag color="green" icon={lucideTagIcon(UserRound)} className={className}>
        {label}
      </BaseTag>
    );
  }

  if (status === "disabled") {
    return (
      <BaseTag color="red" icon={lucideTagIcon(XCircle)} className={className}>
        {label}
      </BaseTag>
    );
  }

  return (
    <BaseTag color="gold" icon={lucideTagIcon(Lock)} className={className}>
      {label}
    </BaseTag>
  );
}
