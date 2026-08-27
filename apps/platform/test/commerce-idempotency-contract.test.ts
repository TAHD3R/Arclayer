import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Commerce mutation idempotency contract", () => {
  it("binds every rendered Commerce mutation key to its target, inputs, and revision", () => {
    const configuration = source("src/pages/commerce-configuration.tsx");
    const payments = source("src/commerce/payment-events-table.tsx");
    const plans = source("src/pages/commerce-plans.tsx");

    expect(configuration).toContain(
      "const fingerprint = JSON.stringify([policy.provider, policy.revision, mode, parsed]);",
    );
    expect(configuration).toContain("idempotencyKey: attempt.key");
    expect(configuration).toContain(
      "if (saveAttempt.current === attempt) saveAttempt.current = null;",
    );

    expect(payments).toContain(
      "const fingerprint = JSON.stringify([props.event.id, props.event.processingAttempts]);",
    );
    expect(payments).toContain("idempotencyKey: attempt.key");
    expect(payments).toContain(
      "if (reconcileAttempt.current === attempt) reconcileAttempt.current = null;",
    );

    expect(plans).toMatch(
      /const fingerprint = JSON\.stringify\(\[\s*props\.planCode,\s*props\.revision\.id,\s*props\.revision\.revision,\s*\]\);/,
    );
    expect(plans).toContain("const fingerprint = JSON.stringify([planCode]);");
    expect(plans).toContain("const fingerprint = JSON.stringify([props.planCode, parsed]);");
    expect(plans).toContain(
      "if (publishAttempt.current === attempt) publishAttempt.current = null;",
    );
    expect(plans).toContain("if (createAttempt.current === attempt) createAttempt.current = null;");
    expect(plans).toContain("const fingerprint = JSON.stringify([props.draft, parsed]);");
    expect(plans).toContain("await updatePlanRevision(");
    expect(plans).toContain("attempt.key,");
  });
});
