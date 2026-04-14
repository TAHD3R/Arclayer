import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { me } from "@/api/auth";
import { normalizeUserProfile } from "@/lib/auth/user-profile";
import { useAuthStore } from "@/stores/use-auth-store";

function readBooleanValue(input: unknown, keys: readonly string[]): boolean {
  if (!input || typeof input !== "object") return false;

  const record = input as Record<string, unknown>;
  for (const key of keys) {
    if (typeof record[key] === "boolean") return Boolean(record[key]);
  }

  return false;
}

export function useCurrentUserProfile() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const sessionVersion = useAuthStore((state) => state.sessionVersion);

  const query = useQuery({
    queryKey: ["auth", "me", sessionVersion],
    enabled: Boolean(accessToken),
    queryFn: async () => me(),
    staleTime: 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const profile = useMemo(() => {
    if (!query.data) return null;

    return {
      ...normalizeUserProfile(query.data),
      isSuperAdmin: readBooleanValue(query.data, ["isSuperAdmin", "is_super_admin"]),
    };
  }, [query.data]);

  return {
    ...query,
    profile,
    isSuperAdmin: Boolean(profile?.isSuperAdmin),
  } as const;
}
