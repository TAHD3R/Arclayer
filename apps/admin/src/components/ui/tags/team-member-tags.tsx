import type { ReactNode } from "react";
import { CheckCircle2, Lock, Mail, UserCog, UserRound, XCircle } from "lucide-react";

import type { TeamMember, UserStatus } from "@arclayer/openapi/admin-types";

import { BaseTag, lucideTagIcon, type TagPresentationProps } from "./tag-base";

type SharedProps = TagPresentationProps & {
  label: ReactNode;
};

export function TeamRoleTag(props: SharedProps) {
  return (
    <BaseTag icon={lucideTagIcon(UserCog)} className={props.className} textStyle={props.textStyle}>
      {props.label}
    </BaseTag>
  );
}

type MembershipStatus = TeamMember["membershipStatus"];

export function TeamMembershipStatusTag(props: SharedProps & { status: MembershipStatus }) {
  const { status, label, className, textStyle } = props;

  if (status === "active") {
    return (
      <BaseTag
        color="green"
        icon={lucideTagIcon(CheckCircle2)}
        className={className}
        textStyle={textStyle}
      >
        {label}
      </BaseTag>
    );
  }

  if (status === "invited") {
    return (
      <BaseTag color="blue" icon={lucideTagIcon(Mail)} className={className} textStyle={textStyle}>
        {label}
      </BaseTag>
    );
  }

  return (
    <BaseTag color="red" icon={lucideTagIcon(XCircle)} className={className} textStyle={textStyle}>
      {label}
    </BaseTag>
  );
}

export function TeamUserStatusTag(props: SharedProps & { status: UserStatus }) {
  const { status, label, className, textStyle } = props;

  if (status === "active") {
    return (
      <BaseTag
        color="green"
        icon={lucideTagIcon(UserRound)}
        className={className}
        textStyle={textStyle}
      >
        {label}
      </BaseTag>
    );
  }

  if (status === "disabled") {
    return (
      <BaseTag
        color="red"
        icon={lucideTagIcon(XCircle)}
        className={className}
        textStyle={textStyle}
      >
        {label}
      </BaseTag>
    );
  }

  return (
    <BaseTag color="gold" icon={lucideTagIcon(Lock)} className={className} textStyle={textStyle}>
      {label}
    </BaseTag>
  );
}
