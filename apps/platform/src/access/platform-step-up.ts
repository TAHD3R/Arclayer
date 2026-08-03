import type { PlatformStepUpProofIssueRequest } from "@arclayer/platform-openapi";

import {
  beginPlatformStepUp,
  completePlatformStepUp,
  PlatformAccessApiError,
} from "@/access/access-api";
import { getPlatformSecurityKey } from "@/auth/webauthn";
import { readPlatformSession } from "@/auth/platform-session";

export type PlatformStepUpContext = Readonly<
  Omit<PlatformStepUpProofIssueRequest, "actorUserId" | "sessionId">
>;

export async function verifyPlatformAction(context: PlatformStepUpContext): Promise<string> {
  const session = readPlatformSession();
  if (!session) throw new PlatformAccessApiError("PLATFORM_SESSION_REQUIRED", 401);

  const request: PlatformStepUpProofIssueRequest = {
    ...context,
    actorUserId: session.principal.actorId,
    sessionId: session.principal.sessionId,
  };

  try {
    const challenge = await beginPlatformStepUp(request);
    const credential = await getPlatformSecurityKey(challenge.options);
    const result = await completePlatformStepUp({
      ...request,
      challengeId: challenge.options.challengeId,
      credential,
    });
    return result.proof;
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotAllowedError") {
      throw new PlatformAccessApiError("PLATFORM_WEBAUTHN_CANCELLED");
    }
    if (error instanceof DOMException && error.name === "NotSupportedError") {
      throw new PlatformAccessApiError("PLATFORM_WEBAUTHN_UNAVAILABLE");
    }
    throw error;
  }
}
