import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { listWorkspaceMemberCreditUsage, type MemberCreditUsageItemOut } from "@/api/commerce";

const MEMBER_CREDIT_USAGE_PAGE_SIZE = 200;

type MemberCreditUsageCollection = Readonly<{
  items: readonly MemberCreditUsageItemOut[];
  periodStart: string;
  periodEnd: string;
}>;

export const peopleMemberCreditUsageQueryKey = (workspaceId: string) =>
  ["commerce", "workspace", workspaceId, "member-usage", "people"] as const;

export async function listAllWorkspaceMemberCreditUsage(
  workspaceId: string,
  signal?: AbortSignal,
): Promise<MemberCreditUsageCollection> {
  const items: MemberCreditUsageItemOut[] = [];
  const seenPages = new Set<number>();
  const membershipIds = new Set<string>();
  let page: number | null = 1;
  let periodStart: string | null = null;
  let periodEnd: string | null = null;

  while (page !== null) {
    if (seenPages.has(page)) {
      throw new Error("Member Credit usage pagination repeated a page");
    }
    seenPages.add(page);
    const result = await listWorkspaceMemberCreditUsage(
      workspaceId,
      { page, size: MEMBER_CREDIT_USAGE_PAGE_SIZE },
      signal,
    );
    if (periodStart === null) {
      periodStart = result.periodStart;
      periodEnd = result.periodEnd;
    } else if (periodStart !== result.periodStart || periodEnd !== result.periodEnd) {
      throw new Error("Member Credit usage pagination returned inconsistent periods");
    }
    for (const item of result.items) {
      if (membershipIds.has(item.membershipId)) {
        throw new Error("Member Credit usage pagination returned a duplicate membership");
      }
      membershipIds.add(item.membershipId);
      items.push(item);
    }
    page = result.next ?? null;
  }

  if (periodStart === null || periodEnd === null) {
    throw new Error("Member Credit usage pagination returned no period");
  }
  return { items, periodStart, periodEnd };
}

export function useTeamMemberCreditUsage(workspaceId: string | null | undefined) {
  const normalizedWorkspaceId = workspaceId ? String(workspaceId) : null;
  const query = useQuery({
    queryKey: peopleMemberCreditUsageQueryKey(normalizedWorkspaceId ?? "unselected"),
    enabled: Boolean(normalizedWorkspaceId),
    queryFn: ({ signal }) => {
      if (!normalizedWorkspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      return listAllWorkspaceMemberCreditUsage(normalizedWorkspaceId, signal);
    },
    retry: false,
    staleTime: 30_000,
    meta: { silent: true },
  });
  const byMembershipId = useMemo(
    () => new Map((query.data?.items ?? []).map((item) => [item.membershipId, item])),
    [query.data?.items],
  );

  return { query, byMembershipId };
}
