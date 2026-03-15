import { useEffect, useState } from "react";

export type ClientPlatform = "mac" | "windows" | "other";

const MAC_PLATFORM_PATTERN = /mac|iphone|ipad|ipod/i;
const WINDOWS_PLATFORM_PATTERN = /win/i;

function getNavigatorPlatformHint(): string {
  if (typeof navigator === "undefined") return "";

  const nav = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };

  return [nav.userAgentData?.platform, navigator.platform, navigator.userAgent].join(" ");
}

export function detectClientPlatform(): ClientPlatform {
  const platformHint = getNavigatorPlatformHint();

  if (MAC_PLATFORM_PATTERN.test(platformHint)) return "mac";
  if (WINDOWS_PLATFORM_PATTERN.test(platformHint)) return "windows";
  return "other";
}

export function useClientPlatform(): ClientPlatform {
  const [platform, setPlatform] = useState<ClientPlatform>(() => detectClientPlatform());

  useEffect(() => {
    setPlatform(detectClientPlatform());
  }, []);

  return platform;
}
