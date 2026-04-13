import type { Meta, StoryObj } from "@storybook/react-vite";

import {
  InlineCode,
  StoryLinkItem,
  StoryNote,
  StoryPage,
  StorySection,
} from "../_internal/storybook-docs";

const componentGroups = [
  {
    title: "Actions",
    description:
      "Buttons and action affordances should expose semantic variants, density, and loading state at the shared package level.",
  },
  {
    title: "Inputs",
    description:
      "Form controls should reflect the shared typography, border, and focus contracts with no page-local resets required.",
  },
  {
    title: "Surfaces",
    description:
      "Cards, panels, dialogs, and overlays define the baseline product rhythm for grouped UI and progressive disclosure.",
  },
] as const;

function ComponentsOverview() {
  return (
    <StoryPage
      eyebrow="Shared components"
      title="Component stories should document the contract, not merely prove that JSX renders."
      description={
        <>
          Start here to understand how the shared UI library is organized. Focused stories cover the
          most reusable surfaces first, while the package index remains the implementation source of
          truth.
        </>
      }
    >
      <StorySection
        title="Coverage model"
        description="Each component story should answer what the primitive is for, which semantics it owns, and which states are expected to remain stable across consuming apps."
      >
        <div className="grid gap-2">
          {componentGroups.map((group) => (
            <StoryLinkItem
              key={group.title}
              title={group.title}
              description={group.description}
              hrefLabel="Open stories"
            />
          ))}
        </div>
      </StorySection>

      <StorySection
        title="Review heuristic"
        description="Shared stories are the fastest place to catch drift before a page-level implementation hides the real issue."
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <StoryNote>
            If multiple pages exhibit the same layout, motion, or state bug, start from{" "}
            <InlineCode>packages/ui</InlineCode> before writing a page-local workaround.
          </StoryNote>
          <StoryNote>
            Prefer a small number of strong stories with clear state coverage over dozens of shallow
            snapshots that do not explain intended behavior.
          </StoryNote>
        </div>
      </StorySection>
    </StoryPage>
  );
}

const meta = {
  title: "Components/Overview",
  component: ComponentsOverview,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Overview for the shared component surface. Focused stories under Components should explain behavior, state coverage, and package ownership.",
      },
    },
  },
} satisfies Meta<typeof ComponentsOverview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {};
