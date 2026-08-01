import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  unstable_defaultDirectiveFormatter,
  unstable_useMentionAdapter,
  unstable_useTriggerPopoverScopeContext,
  useLocalRuntime,
  type ChatModelAdapter,
} from "@assistant-ui/react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, type PropsWithChildren } from "react";
import { describe, expect, it } from "vitest";

import { AIComposerTriggerInput } from "@/components/ai/ai-composer-trigger-input";

const noOpAdapter: ChatModelAdapter = {
  async *run() {},
};

function RuntimeProvider({ children }: PropsWithChildren) {
  const runtime = useLocalRuntime(noOpAdapter);
  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>;
}

function AutoSelectFirstCategory() {
  const scope = unstable_useTriggerPopoverScopeContext();

  useEffect(() => {
    if (!scope.open || scope.activeCategoryId || scope.categories.length === 0) return;
    scope.selectCategory(scope.categories[0].id);
  }, [scope]);

  return null;
}

function MentionComposer() {
  const mention = unstable_useMentionAdapter({
    categories: [
      {
        id: "agents",
        label: "Agents",
        items: [{ id: "agent-1", type: "agent", label: "Data Analyst" }],
      },
    ],
    includeModelContextTools: false,
    formatter: unstable_defaultDirectiveFormatter,
  });

  return (
    <ComposerPrimitive.Unstable_TriggerPopoverRoot>
      <ComposerPrimitive.Root>
        <AIComposerTriggerInput aria-label="Composer input" />
        <ComposerPrimitive.Unstable_TriggerPopover char="@" adapter={mention.adapter}>
          <ComposerPrimitive.Unstable_TriggerPopover.Directive {...mention.directive} />
          <AutoSelectFirstCategory />
        </ComposerPrimitive.Unstable_TriggerPopover>
      </ComposerPrimitive.Root>
    </ComposerPrimitive.Unstable_TriggerPopoverRoot>
  );
}

describe("AIComposerTriggerInput", () => {
  it("deletes an empty @ trigger instead of navigating back into categories", async () => {
    const user = userEvent.setup();
    render(
      <RuntimeProvider>
        <MentionComposer />
      </RuntimeProvider>,
    );
    const input = screen.getByRole<HTMLTextAreaElement>("textbox", {
      name: "Composer input",
    });

    await user.type(input, "@");
    await waitFor(() => expect(input).toHaveAttribute("aria-expanded", "true"));
    await user.keyboard("{Backspace}");

    expect(input).toHaveValue("");
    expect(input).not.toHaveAttribute("aria-expanded");
  });

  it("keeps normal Backspace behavior while the mention query is not empty", async () => {
    const user = userEvent.setup();
    render(
      <RuntimeProvider>
        <MentionComposer />
      </RuntimeProvider>,
    );
    const input = screen.getByRole<HTMLTextAreaElement>("textbox", {
      name: "Composer input",
    });

    await user.type(input, "@a");
    await user.keyboard("{Backspace}");

    expect(input).toHaveValue("@");

    await user.keyboard("{Backspace}");

    expect(input).toHaveValue("");
  });
});
