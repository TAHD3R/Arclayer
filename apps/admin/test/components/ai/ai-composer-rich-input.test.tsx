import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  INTERNAL,
  useAui,
  useAuiState,
  useLocalRuntime,
  type ChatModelAdapter,
} from "@assistant-ui/react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState, type PropsWithChildren } from "react";
import { describe, expect, it } from "vitest";

import {
  AI_COMPOSER_DIRECTIVE_CHIP_STYLES,
  AIComposerDirectiveInsertionProvider,
  AIComposerRichInput,
  insertSerializedDirectiveAtCursor,
  useAIComposerDirectiveInsertion,
} from "@/components/ai/ai-composer-rich-input";

const noOpAdapter: ChatModelAdapter = {
  async *run() {},
};

function RuntimeProvider({ children }: PropsWithChildren) {
  const runtime = useLocalRuntime(noOpAdapter);
  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>;
}

function ComposerStateProbe() {
  const text = useAuiState((state) => state.composer.text);
  return <output data-testid="composer-text">{text}</output>;
}

function InitialComposerText({ text }: { text?: string }) {
  const aui = useAui();
  useEffect(() => {
    if (text) aui.composer().setText(text);
  }, [aui, text]);
  return null;
}

function InsertButtons() {
  const aui = useAui();
  const { insertDirective } = useAIComposerDirectiveInsertion();
  return (
    <>
      <button
        type="button"
        onClick={() => insertDirective({ type: "skill", id: "skill-1", label: "Content Review" })}
      >
        Insert Skill
      </button>
      <button
        type="button"
        onClick={() => insertDirective({ type: "agent", id: "agent-1", label: "Data Analyst" })}
      >
        Insert Agent
      </button>
      <button
        type="button"
        onClick={() =>
          void aui.composer().addAttachment({
            id: "attachment-1",
            type: "file",
            name: "brief.pdf",
            contentType: "application/pdf",
            content: [],
          })
        }
      >
        Add Attachment
      </button>
    </>
  );
}

function BackspacePluginProbe() {
  const aui = useAui();
  const pluginRegistry = INTERNAL.useComposerInputPluginRegistryOptional();
  const [result, setResult] = useState("");

  useEffect(() => {
    if (!pluginRegistry) return undefined;
    return pluginRegistry.register({
      handleKeyDown: (event) => {
        event.preventDefault();
        return true;
      },
      setCursorPosition: () => undefined,
    });
  }, [pluginRegistry]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          const plugins = pluginRegistry?.getPlugins() ?? [];
          const cursorPosition = aui.composer().getState().text.length;
          for (const plugin of plugins) plugin.setCursorPosition(cursorPosition);
          let prevented = false;
          const consumed = plugins.some((plugin) =>
            plugin.handleKeyDown({
              key: "Backspace",
              shiftKey: false,
              preventDefault: () => {
                prevented = true;
              },
            }),
          );
          setResult(`${String(consumed)}:${String(prevented)}`);
        }}
      >
        Probe Backspace
      </button>
      <output data-testid="backspace-plugin-result">{result}</output>
    </>
  );
}

function TestComposer({ initialText }: { initialText?: string }) {
  return (
    <ComposerPrimitive.Unstable_TriggerPopoverRoot>
      <AIComposerDirectiveInsertionProvider>
        <ComposerPrimitive.Root>
          <InitialComposerText text={initialText} />
          <AIComposerRichInput aria-label="Composer input" />
          <BackspacePluginProbe />
          <InsertButtons />
          <ComposerStateProbe />
        </ComposerPrimitive.Root>
      </AIComposerDirectiveInsertionProvider>
    </ComposerPrimitive.Unstable_TriggerPopoverRoot>
  );
}

describe("AIComposerRichInput", () => {
  it("uses the Lexical atomic-node contract required for one-step Backspace removal", async () => {
    render(
      <RuntimeProvider>
        <TestComposer initialText="Hello :skill[Content Review]{name=skill-1}" />
      </RuntimeProvider>,
    );

    const chip = await screen.findByText("Content Review");
    expect(chip.closest("[data-ai-directive-chip]")).toHaveClass(
      "h-[1.45em]",
      "mx-[0.25em]",
      "text-[0.86em]",
      "bg-violet-500/12",
    );
    expect(chip.closest("[data-lexical-decorator='true']")).toHaveAttribute(
      "aria-label",
      "Content Review",
    );
  });

  it("inserts an uploaded attachment at the stored cursor using its own color token", async () => {
    const user = userEvent.setup();
    render(
      <RuntimeProvider>
        <TestComposer initialText="AB" />
      </RuntimeProvider>,
    );
    const input = screen.getByRole("textbox", { name: "Composer input" });

    await waitFor(() => expect(screen.getByTestId("composer-text")).toHaveTextContent("AB"));
    input.focus();
    await user.click(screen.getByRole("button", { name: "Add Attachment" }));

    const chip = await screen.findByText("brief.pdf");
    await waitFor(() =>
      expect(screen.getByTestId("composer-text")).toHaveTextContent(
        ":attachment[brief.pdf]{name=attachment-1}AB",
      ),
    );
    expect(chip.closest("[data-ai-directive-chip]")).toHaveClass("bg-amber-500/12");
  });

  it("renders Agent directives with a distinct color token", async () => {
    const user = userEvent.setup();
    render(
      <RuntimeProvider>
        <TestComposer />
      </RuntimeProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Insert Agent" }));

    const chip = await screen.findByText("Data Analyst");
    expect(chip.closest("[data-ai-directive-chip]")).toHaveClass("bg-sky-500/12");
    expect(screen.getByTestId("composer-text")).toHaveTextContent(
      ":agent[Data Analyst]{name=agent-1}",
    );
  });

  it("keeps insertion helpers and type colors explicitly configurable", () => {
    expect(insertSerializedDirectiveAtCursor("beforeafter", 6, "[chip]")).toBe("before[chip]after");
    expect(AI_COMPOSER_DIRECTIVE_CHIP_STYLES.attachment).not.toBe(
      AI_COMPOSER_DIRECTIVE_CHIP_STYLES.skill,
    );
    expect(AI_COMPOSER_DIRECTIVE_CHIP_STYLES.skill).not.toBe(
      AI_COMPOSER_DIRECTIVE_CHIP_STYLES.agent,
    );
  });

  it.each(["@", "/"])(
    "keeps native Backspace ahead of the trigger panel for an empty %s",
    async (trigger) => {
      const user = userEvent.setup();
      render(
        <RuntimeProvider>
          <TestComposer initialText={trigger} />
        </RuntimeProvider>,
      );

      await waitFor(() => expect(screen.getByTestId("composer-text")).toHaveTextContent(trigger));
      await user.click(screen.getByRole("button", { name: "Probe Backspace" }));

      expect(screen.getByTestId("backspace-plugin-result")).toHaveTextContent("true:false");
    },
  );
});
