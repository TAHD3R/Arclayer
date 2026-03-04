import type { ReactNode } from "react";
import type { CSSProperties } from "react";
import { CheckCircle2, Crown, Lock, Mail, Shield, User, XCircle } from "lucide-react";

import type { OrgMembershipStatus, OrgRole, OrgUserStatus } from "@/types/api";

import { BaseTag, lucideTagIcon } from "./tag-base";

type SharedTagProps = {
  className?: string;
  style?: CSSProperties;
};

export function OrgRoleTag(props: SharedTagProps & { role: OrgRole; label: ReactNode }) {
  const { role, label, className, style } = props;

  if (role === "owner") {
    return (
      <BaseTag color="gold" icon={lucideTagIcon(Crown)} className={className} style={style}>
        {label}
      </BaseTag>
    );
  }

  if (role === "admin") {
    return (
      <BaseTag color="blue" icon={lucideTagIcon(Shield)} className={className} style={style}>
        {label}
      </BaseTag>
    );
  }

  return (
    <BaseTag color="default" icon={lucideTagIcon(User)} className={className} style={style}>
      {label}
    </BaseTag>
  );
}

export function OrgMembershipStatusTag(
  props: SharedTagProps & { status: OrgMembershipStatus; label: ReactNode },
) {
  const { status, label, className, style } = props;

  if (status === "active") {
    return (
      <BaseTag color="green" icon={lucideTagIcon(CheckCircle2)} className={className} style={style}>
        {label}
      </BaseTag>
    );
  }

  if (status === "invited") {
    return (
      <BaseTag color="blue" icon={lucideTagIcon(Mail)} className={className} style={style}>
        {label}
      </BaseTag>
    );
  }

  return (
    <BaseTag color="red" icon={lucideTagIcon(XCircle)} className={className} style={style}>
      {label}
    </BaseTag>
  );
}

export function OrgUserStatusTag(
  props: SharedTagProps & { status: OrgUserStatus; label: ReactNode },
) {
  const { status, label, className, style } = props;

  if (status === "active") {
    return (
      <BaseTag color="green" icon={lucideTagIcon(CheckCircle2)} className={className} style={style}>
        {label}
      </BaseTag>
    );
  }

  if (status === "disabled") {
    return (
      <BaseTag color="red" icon={lucideTagIcon(XCircle)} className={className} style={style}>
        {label}
      </BaseTag>
    );
  }

  return (
    <BaseTag color="gold" icon={lucideTagIcon(Lock)} className={className} style={style}>
      {label}
    </BaseTag>
  );
}
