import type { RemoteThreadListAdapter } from "@assistant-ui/react";

import {
  createAgentThread,
  deleteAgentThread,
  getAgentThread,
  listAgentThreads,
  type AgentThreadV1,
  updateAgentThread,
} from "./agent-thread-api";
import { AgentRuntimeProtocolError } from "./agent-runtime-protocol";

export interface AgentThreadListAdapterOptions {
  readonly workspaceId: string;
  readonly projectId: string | null;
  readonly leadAgentId: string;
  readonly initialTitle: string;
}

function toRemoteThread(thread: AgentThreadV1) {
  return {
    remoteId: thread.threadId,
    externalId: thread.threadId,
    status: thread.archivedAt === null ? ("regular" as const) : ("archived" as const),
    title: thread.title,
    lastMessageAt: new Date(thread.updatedAt),
    custom: {
      protocolVersion: thread.protocolVersion,
      workspaceId: thread.workspaceId,
      projectId: thread.projectId,
      leadAgentId: thread.leadAgentId,
      leadAgentVersionId: thread.leadAgentVersionId,
      leadAgentAssignmentId: thread.leadAgentAssignmentId,
      archivedAt: thread.archivedAt,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
    },
  };
}

export function createAgentThreadListAdapter(
  options: AgentThreadListAdapterOptions,
): RemoteThreadListAdapter {
  return {
    async list(page) {
      const result = await listAgentThreads(options.workspaceId, {
        projectId: options.projectId,
        cursor: page?.after,
        limit: 50,
      });
      return {
        threads: result.items.map(toRemoteThread),
        ...(result.nextCursor === null ? {} : { nextCursor: result.nextCursor }),
      };
    },
    async initialize(threadId) {
      const thread = await createAgentThread(options.workspaceId, {
        idempotencyKey: threadId,
        projectId: options.projectId,
        leadAgentId: options.leadAgentId,
        title: options.initialTitle,
      });
      return { remoteId: thread.threadId, externalId: thread.threadId };
    },
    async fetch(threadId) {
      return toRemoteThread(await getAgentThread(options.workspaceId, threadId));
    },
    async rename(remoteId, newTitle) {
      await updateAgentThread(options.workspaceId, remoteId, { title: newTitle });
    },
    async archive(remoteId) {
      await updateAgentThread(options.workspaceId, remoteId, { archived: true });
    },
    async unarchive(remoteId) {
      await updateAgentThread(options.workspaceId, remoteId, { archived: false });
    },
    async delete(remoteId) {
      await deleteAgentThread(options.workspaceId, remoteId);
    },
    async generateTitle() {
      throw new AgentRuntimeProtocolError("AGENT_THREAD_TITLE_GENERATION_UNAVAILABLE");
    },
  };
}
