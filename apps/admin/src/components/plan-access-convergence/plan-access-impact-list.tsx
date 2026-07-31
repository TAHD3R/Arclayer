import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import type { i18n as I18nInstance } from "i18next";

import type {
  ConvergenceImpactSnapshot,
  FeatureSeatAssignmentImpact,
  MemberImpact,
} from "@/api/plan-access-convergence";
import { Badge } from "@arclayer/ui/badge";
import { Checkbox } from "@arclayer/ui/checkbox";

type PlanAccessImpactListProps = Readonly<{
  snapshot: ConvergenceImpactSnapshot;
  retainedAssignmentIds: readonly string[];
  onAssignmentRetainedChange: (assignmentId: string, retained: boolean) => void;
  resolveQueuedEffectLabel: (effectType: string) => string;
  readOnly: boolean;
}>;

function ImpactGroup(props: Readonly<{ title: string; emptyLabel: string; children: ReactNode }>) {
  const hasRows = Array.isArray(props.children)
    ? props.children.length > 0
    : Boolean(props.children);
  return (
    <section className="rounded-xl border border-border/70 bg-background/60 p-4">
      <h3 className="text-headline text-label-primary">{props.title}</h3>
      {hasRows ? (
        <ul className="mt-3 divide-y divide-border/60">{props.children}</ul>
      ) : (
        <p className="mt-2 text-footnote text-label-secondary">{props.emptyLabel}</p>
      )}
    </section>
  );
}

function ImpactRow(props: Readonly<{ primary: string; secondary?: string; trailing?: ReactNode }>) {
  return (
    <li className="flex min-w-0 items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="truncate text-footnote font-medium text-label-primary">{props.primary}</p>
        {props.secondary ? (
          <p className="mt-0.5 text-caption text-label-secondary">{props.secondary}</p>
        ) : null}
      </div>
      {props.trailing}
    </li>
  );
}

function memberName(members: readonly MemberImpact[], userId: string): string {
  const member = members.find((candidate) => candidate.userId === userId);
  if (!member) throw new Error("Convergence preview references an unnamed affected member");
  return member.displayName;
}

function productLabel(resolvedLabel: string, technicalKey: string, labelKind: string): string {
  const label = resolvedLabel.trim();
  if (!label || label === technicalKey) {
    throw new Error(`Missing product label for ${labelKind}`);
  }
  return label;
}

function localizedProductLabel(i18n: I18nInstance, key: string, labelKind: string): string {
  if (!key.trim() || !i18n.exists(key)) {
    throw new Error(`Missing product label for ${labelKind}`);
  }
  const translated = i18n.t(key);
  if (typeof translated !== "string") {
    throw new Error(`Invalid product label for ${labelKind}`);
  }
  return productLabel(translated, key, labelKind);
}

function isRetentionUnavailable(
  snapshot: ConvergenceImpactSnapshot,
  assignment: FeatureSeatAssignmentImpact,
  retainedAssignmentIds: readonly string[],
): boolean {
  if (retainedAssignmentIds.includes(assignment.assignmentId)) return false;
  const limit = snapshot.targetRevision.memberSeatLimits?.[assignment.entitlementKey];
  if (limit === undefined) return true;
  if (limit === null) return false;
  const selectedForFeature = snapshot.featureAssignments.filter(
    (item) =>
      item.entitlementKey === assignment.entitlementKey &&
      retainedAssignmentIds.includes(item.assignmentId),
  ).length;
  return selectedForFeature >= limit;
}

export function PlanAccessImpactList(props: PlanAccessImpactListProps) {
  const { t, i18n } = useTranslation(["planChange"]);
  const { snapshot } = props;
  const empty = t("planChange:NO_AFFECTED_ITEMS");
  const responsibilitiesWillEnd = !snapshot.targetRevision.rolesManageIncluded;
  const responsibilityStatus = (
    <Badge variant="outline">
      {t(responsibilitiesWillEnd ? "planChange:WILL_END" : "planChange:WILL_REMAIN")}
    </Badge>
  );

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <ImpactGroup title={t("planChange:ACTIVE_MEMBERS_TITLE")} emptyLabel={empty}>
        {snapshot.activeMembers.map((member) => (
          <ImpactRow
            key={member.membershipId}
            primary={member.displayName}
            secondary={t("planChange:MEMBER_ACCESS_REVIEWED")}
          />
        ))}
      </ImpactGroup>

      <ImpactGroup title={t("planChange:RESPONSIBILITIES_TITLE")} emptyLabel={empty}>
        {snapshot.roleResponsibilities.map((responsibility) => (
          <ImpactRow
            key={responsibility.assignmentId}
            primary={memberName(snapshot.activeMembers, responsibility.userId)}
            secondary={t(
              responsibilitiesWillEnd
                ? "planChange:RESPONSIBILITY_WILL_END"
                : "planChange:RESPONSIBILITY_WILL_REMAIN",
              {
                responsibility: responsibility.roleName,
              },
            )}
            trailing={responsibilityStatus}
          />
        ))}
      </ImpactGroup>

      <ImpactGroup title={t("planChange:CUSTOM_ROLES_TITLE")} emptyLabel={empty}>
        {snapshot.customRoles.map((role) => (
          <ImpactRow
            key={role.roleId}
            primary={role.roleName}
            secondary={t(
              responsibilitiesWillEnd
                ? "planChange:CUSTOM_ROLE_WILL_END"
                : "planChange:CUSTOM_ROLE_WILL_REMAIN",
            )}
            trailing={responsibilityStatus}
          />
        ))}
      </ImpactGroup>

      <ImpactGroup title={t("planChange:BILLING_MANAGERS_TITLE")} emptyLabel={empty}>
        {snapshot.billingManagers.map((member) => (
          <ImpactRow
            key={member.membershipId}
            primary={member.displayName}
            secondary={t(
              responsibilitiesWillEnd
                ? "planChange:BILLING_RESPONSIBILITY_WILL_END"
                : "planChange:BILLING_RESPONSIBILITY_WILL_REMAIN",
            )}
            trailing={responsibilityStatus}
          />
        ))}
      </ImpactGroup>

      <ImpactGroup title={t("planChange:FEATURE_MANAGERS_TITLE")} emptyLabel={empty}>
        {snapshot.featureSeatManagers.map((member) => (
          <ImpactRow
            key={member.membershipId}
            primary={member.displayName}
            secondary={t(
              responsibilitiesWillEnd
                ? "planChange:FEATURE_RESPONSIBILITY_WILL_END"
                : "planChange:FEATURE_RESPONSIBILITY_WILL_REMAIN",
            )}
            trailing={responsibilityStatus}
          />
        ))}
      </ImpactGroup>

      <ImpactGroup title={t("planChange:EMAIL_INVITATIONS_TITLE")} emptyLabel={empty}>
        {snapshot.emailInvitations.map((invitation) => (
          <ImpactRow
            key={invitation.invitationId}
            primary={invitation.recipientLabel}
            secondary={t(
              responsibilitiesWillEnd
                ? "planChange:INVITATION_WILL_END"
                : "planChange:INVITATION_WILL_REMAIN",
            )}
            trailing={responsibilityStatus}
          />
        ))}
      </ImpactGroup>

      <ImpactGroup title={t("planChange:REUSABLE_LINKS_TITLE")} emptyLabel={empty}>
        {snapshot.reusableInvitationLinks.map((invitation) => (
          <ImpactRow
            key={invitation.invitationId}
            primary={invitation.recipientLabel}
            secondary={t(
              responsibilitiesWillEnd
                ? "planChange:INVITATION_LINK_WILL_END"
                : "planChange:INVITATION_LINK_WILL_REMAIN",
            )}
            trailing={responsibilityStatus}
          />
        ))}
      </ImpactGroup>

      <ImpactGroup title={t("planChange:QUEUED_WORK_TITLE")} emptyLabel={empty}>
        {snapshot.queuedEffects.map((effect) => (
          <ImpactRow
            key={effect.effectId}
            primary={memberName(snapshot.activeMembers, effect.actorUserId)}
            secondary={productLabel(
              props.resolveQueuedEffectLabel(effect.effectType),
              effect.effectType,
              "queued work",
            )}
            trailing={<Badge variant="outline">{t("planChange:WILL_RECHECK")}</Badge>}
          />
        ))}
      </ImpactGroup>

      <section className="rounded-xl border border-border/70 bg-background/60 p-4 md:col-span-2">
        <h3 className="text-headline text-label-primary">{t("planChange:FEATURE_ACCESS_TITLE")}</h3>
        <p className="mt-1 text-footnote text-label-secondary">
          {t("planChange:FEATURE_ACCESS_DESCRIPTION")}
        </p>
        {snapshot.featureAssignments.length === 0 ? (
          <p className="mt-3 text-footnote text-label-secondary">{empty}</p>
        ) : (
          <ul className="mt-3 divide-y divide-border/60">
            {snapshot.featureAssignments.map((assignment) => {
              const retained = props.retainedAssignmentIds.includes(assignment.assignmentId);
              const feature = localizedProductLabel(i18n, assignment.nameI18NKey, "feature access");
              const featureDescription = localizedProductLabel(
                i18n,
                assignment.descriptionI18NKey,
                "feature access description",
              );
              const name = memberName(snapshot.activeMembers, assignment.userId);
              const checkboxId = `retain-plan-access-${assignment.assignmentId}`;
              return (
                <li
                  key={assignment.assignmentId}
                  className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Checkbox
                      id={checkboxId}
                      checked={retained}
                      disabled={
                        isRetentionUnavailable(snapshot, assignment, props.retainedAssignmentIds) ||
                        props.readOnly
                      }
                      aria-label={t("planChange:RETAIN_MEMBER_ACCESS_LABEL", { name, feature })}
                      onCheckedChange={(checked) =>
                        props.onAssignmentRetainedChange(assignment.assignmentId, checked === true)
                      }
                    />
                    <label htmlFor={checkboxId} className="min-w-0 cursor-pointer">
                      <span className="block truncate text-footnote font-medium text-label-primary">
                        {name}
                      </span>
                      <span className="block text-caption text-label-secondary">{feature}</span>
                      <span className="block text-caption text-label-tertiary">
                        {featureDescription}
                      </span>
                    </label>
                  </div>
                  <Badge variant={retained ? "secondary" : "outline"}>
                    {retained ? t("planChange:WILL_KEEP") : t("planChange:WILL_END")}
                  </Badge>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
