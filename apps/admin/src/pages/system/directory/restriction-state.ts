import type { AccessRestrictionAdmin } from "@arclayer/openapi/admin-types";

export type DirectoryRestrictionType =
  | "user_disabled"
  | "workspace_suspended"
  | "workspace_archived"
  | "project_suspended";

type RestrictionCarrier = {
  restrictions?: AccessRestrictionAdmin[];
};

export function findDirectoryRestriction(
  entity: RestrictionCarrier,
  restrictionType: DirectoryRestrictionType,
): AccessRestrictionAdmin | null {
  return (
    entity.restrictions?.find((restriction) => restriction.restrictionType === restrictionType) ??
    null
  );
}

export function isDirectoryRestrictionActive(
  entity: RestrictionCarrier,
  restrictionType: DirectoryRestrictionType,
): boolean {
  return findDirectoryRestriction(entity, restrictionType)?.state === "active";
}

export function getDirectoryRestrictionRevision(
  entity: RestrictionCarrier,
  restrictionType: DirectoryRestrictionType,
): number {
  return findDirectoryRestriction(entity, restrictionType)?.revision ?? 0;
}
