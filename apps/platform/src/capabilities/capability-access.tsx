import { createContext, useContext, type ReactNode } from "react";
import type { PlatformCapabilityOut } from "@arclayer/platform-openapi";

const CapabilityAccessContext = createContext<readonly PlatformCapabilityOut[] | null>(null);

export function CapabilityAccessProvider(props: {
  capabilities: readonly PlatformCapabilityOut[];
  children: ReactNode;
}) {
  return (
    <CapabilityAccessContext.Provider value={props.capabilities}>
      {props.children}
    </CapabilityAccessContext.Provider>
  );
}

export function useCapabilityAccess(capabilityId: string): PlatformCapabilityOut {
  const capabilities = useContext(CapabilityAccessContext);
  if (!capabilities) {
    throw new Error("Platform capability access is unavailable outside PlatformShell");
  }
  const capability = capabilities.find((item) => item.capabilityId === capabilityId);
  if (!capability) {
    throw new Error(`Platform capability is unavailable: ${capabilityId}`);
  }
  return capability;
}
