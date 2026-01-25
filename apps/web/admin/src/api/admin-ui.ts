import { api } from "@/lib/http";
import type { AdminUIContext } from "@/api/types";

export const adminUiApi = {
  getContext: () => api.get<AdminUIContext>("/admin/ui/context"),
} as const;
