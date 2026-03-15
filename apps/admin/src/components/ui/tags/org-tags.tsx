import type { ReactNode } from "react";
import { CheckCircle2, Crown, Lock, Mail, Shield, User, XCircle } from "lucide-react";

import type { OrgMembershipStatus, OrgRole, OrgUserStatus } from "@/types/api";

import { BaseTag, lucideTagIcon, type TagPresentationProps } from "./tag-base";

type SharedTagProps = TagPresentationProps;

export function OrgRoleTag(props: SharedTagProps & { role: OrgRole; label: ReactNode }) {
  const { role, label, className, style, textStyle } = props;

  if (role === "owner") {
    return (
      <BaseTag
        color="gold"
        icon={lucideTagIcon(Crown)}
        className={className}
        style={style}
        textStyle={textStyle}
      >
        {label}
      </BaseTag>
    );
  }

  if (role === "admin") {
    return (
      <BaseTag
        color="blue"
        icon={lucideTagIcon(Shield)}
        className={className}
        style={style}
        textStyle={textStyle}
      >
        {label}
      </BaseTag>
    );
  }

  return (
    <BaseTag
      color="default"
      icon={lucideTagIcon(User)}
      className={className}
      style={style}
      textStyle={textStyle}
    >
      {label}
    </BaseTag>
  );
}

export function OrgMembershipStatusTag(
  props: SharedTagProps & { status: OrgMembershipStatus; label: ReactNode },
) {
  const { status, label, className, style, textStyle } = props;

  if (status === "active") {
    return (
      <BaseTag
        color="green"
        icon={lucideTagIcon(CheckCircle2)}
        className={className}
        style={style}
        textStyle={textStyle}
      >
        {label}
      </BaseTag>
    );
  }

  if (status === "invited") {
    return (
      <BaseTag
        color="blue"
        icon={lucideTagIcon(Mail)}
        className={className}
        style={style}
        textStyle={textStyle}
      >
        {label}
      </BaseTag>
    );
  }

  return (
    <BaseTag
      color="red"
      icon={lucideTagIcon(XCircle)}
      className={className}
      style={style}
      textStyle={textStyle}
    >
      {label}
    </BaseTag>
  );
}

export function OrgUserStatusTag(
  props: SharedTagProps & { status: OrgUserStatus; label: ReactNode },
) {
  const { status, label, className, style, textStyle } = props;

  if (status === "active") {
    return (
      <BaseTag
        color="green"
        icon={lucideTagIcon(CheckCircle2)}
        className={className}
        style={style}
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
        style={style}
        textStyle={textStyle}
      >
        {label}
      </BaseTag>
    );
  }

  return (
    <BaseTag
      color="gold"
      icon={lucideTagIcon(Lock)}
      className={className}
      style={style}
      textStyle={textStyle}
    >
      {label}
    </BaseTag>
  );
}
