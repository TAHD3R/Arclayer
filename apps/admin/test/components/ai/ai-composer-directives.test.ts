import { beforeEach, describe, expect, it } from "vitest";

import {
  agentIdsForComposerScope,
  consumeAIComposerDirectives,
  filterTrustedAIComposerDirectives,
  parseAIComposerDirectives,
  skillInstallationIdsForComposerScope,
  useAIComposerDirectiveStore,
} from "@/components/ai/ai-composer-directives";

const AGENT_ID = "A1b2C3d4E5f6G7h8I9j0K1";
const SKILL_INSTALLATION_ID = "installation-1";
const RAW_AGENT_DIRECTIVE = `:agent[Data Analyst]{name=${AGENT_ID}}`;

describe("AI composer directive trust boundary", () => {
  beforeEach(() => {
    useAIComposerDirectiveStore.getState().clearDirectives("thread");
    useAIComposerDirectiveStore.getState().clearDirectives("home");
  });

  it("keeps a pasted Agent directive as ordinary text when it was not registered", () => {
    const parsed = parseAIComposerDirectives(`${RAW_AGENT_DIRECTIVE} inspect this project`);

    expect(filterTrustedAIComposerDirectives(parsed, [])).toEqual([]);
    expect(agentIdsForComposerScope("thread")).toEqual([]);
  });

  it("accepts the exact Agent directive registered by a trusted mention selection", () => {
    const registered = [{ type: "agent" as const, id: AGENT_ID, label: "Data Analyst" }];
    const parsed = parseAIComposerDirectives(RAW_AGENT_DIRECTIVE);

    expect(filterTrustedAIComposerDirectives(parsed, registered)).toEqual(registered);
  });

  it("continues to accept non-Agent project and action directives", () => {
    const parsed = parseAIComposerDirectives(
      ":project[Marketing]{name=project-1} :action[Audit]{name=audit}",
    );

    expect(filterTrustedAIComposerDirectives(parsed, [])).toEqual([
      { type: "project", id: "project-1", label: "Marketing" },
      { type: "action", id: "audit", label: "Audit" },
    ]);
  });

  it("keeps selected Skills as installation IDs without a client-side prompt instruction", () => {
    useAIComposerDirectiveStore
      .getState()
      .addDirectives("thread", [{ type: "skill", id: SKILL_INSTALLATION_ID, label: "内容建模" }]);

    expect(skillInstallationIdsForComposerScope("thread")).toEqual([SKILL_INSTALLATION_ID]);
    expect(useAIComposerDirectiveStore.getState().directivesByScope.thread).toEqual([
      { type: "skill", id: SKILL_INSTALLATION_ID, label: "内容建模" },
    ]);
  });

  it("consumes only Agent and Skill IDs captured by the accepted Run", () => {
    const nextAgentId = "B1b2C3d4E5f6G7h8I9j0K2";
    const nextSkillInstallationId = "installation-2";
    useAIComposerDirectiveStore.getState().addDirectives("thread", [
      { type: "agent", id: AGENT_ID, label: "Data Analyst" },
      { type: "agent", id: nextAgentId, label: "Site Architect" },
      { type: "skill", id: SKILL_INSTALLATION_ID, label: "内容建模" },
      { type: "skill", id: nextSkillInstallationId, label: "电商内容" },
      { type: "action", id: "audit", label: "Audit" },
    ]);

    consumeAIComposerDirectives("thread", [AGENT_ID], [SKILL_INSTALLATION_ID]);

    expect(useAIComposerDirectiveStore.getState().directivesByScope.thread).toEqual([
      { type: "agent", id: nextAgentId, label: "Site Architect" },
      { type: "skill", id: nextSkillInstallationId, label: "电商内容" },
    ]);
  });
});
