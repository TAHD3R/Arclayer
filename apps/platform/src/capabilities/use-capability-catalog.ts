import { useCallback, useEffect, useState } from "react";
import type { PlatformCapabilityCatalogOut } from "@arclayer/platform-openapi";

import { getPlatformCapabilityCatalog } from "@/capabilities/catalog-api";

export type PlatformCapabilityCatalogState =
  | Readonly<{ status: "loading"; retry: () => void }>
  | Readonly<{ status: "error"; retry: () => void }>
  | Readonly<{
      status: "success";
      catalog: PlatformCapabilityCatalogOut;
      retry: () => void;
    }>;

export function usePlatformCapabilityCatalog(): PlatformCapabilityCatalogState {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<
    | Readonly<{ status: "loading" }>
    | Readonly<{ status: "error" }>
    | Readonly<{ status: "success"; catalog: PlatformCapabilityCatalogOut }>
  >({ status: "loading" });
  const retry = useCallback(() => setRevision((current) => current + 1), []);

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    void getPlatformCapabilityCatalog().then(
      (catalog) => {
        if (active) setState({ status: "success", catalog });
      },
      () => {
        if (active) setState({ status: "error" });
      },
    );
    return () => {
      active = false;
    };
  }, [revision]);

  return state.status === "success"
    ? { status: "success", catalog: state.catalog, retry }
    : { status: state.status, retry };
}
