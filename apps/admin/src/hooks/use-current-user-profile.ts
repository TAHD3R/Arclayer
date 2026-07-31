import { useQuery } from "@tanstack/react-query";

import { me } from "@/api/auth";
import { normalizeUserProfile } from "@/lib/auth/user-profile";
import { useAuthStore } from "@/stores/use-auth-store";

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

  const profile = query.data ? normalizeUserProfile(query.data) : null;

  return {
    ...query,
    profile,
  } as const;
}
