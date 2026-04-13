import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "@arclayer/ui/button";

import {
  InlineCode,
  StoryLinkItem,
  StoryMetric,
  StoryNote,
  StoryPage,
  StorySection,
} from "../_internal/storybook-docs";

const categories = [
  {
    title: "Introduction",
    description:
      "Why this Storybook exists, which boundaries it enforces, and how teams should use it.",
  },
  {
    title: "Theme",
    description:
      "Light and dark theme behavior, theme switching expectations, and surface sanity checks.",
  },
  {
    title: "Design System",
    description: "The token contract for typography, semantic color, radius, and shadow decisions.",
  },
  {
    title: "Components",
    description:
      "Shared UI building blocks from packages/ui with focused, reviewable usage stories.",
  },
  {
    title: "Icons",
    description: "Animated and brand icon assets exposed by the shared UI package.",
  },
  {
    title: "Hooks",
    description:
      "Shared interaction hooks from packages/hooks, documented with live behavioral demos.",
  },
  {
    title: "Providers",
    description: "Context requirements for shared UI features that need explicit runtime wiring.",
  },
] as const;

function StorybookOverview() {
  return (
    <StoryPage
      eyebrow="Shared UI workspace"
      title="Arclayer UI Storybook is the design-system workspace for shared packages."
      description={
        <>
          This Storybook is centered on <InlineCode>packages/ui</InlineCode> and adjacent shared
          runtime surfaces. It documents reusable contracts, not admin page shells. Stories remain
          centralized under <InlineCode>apps/admin/stories</InlineCode>, but the visual language
          should feel like a product documentation site rather than an internal sandbox.
        </>
      }
      heroActions={
        <>
          <Button size="sm">Browse Components</Button>
          <Button size="sm" variant="outline">
            Read Design System
          </Button>
        </>
      }
    >
      <StorySection
        title="What this workspace covers"
        description="The top-level sections are product documentation entry points. They should guide design and implementation decisions before a team reaches for page-local code."
      >
        <div className="grid gap-2">
          {categories.map((category) => (
            <StoryLinkItem
              key={category.title}
              title={category.title}
              description={category.description}
              hrefLabel="Read section"
            />
          ))}
        </div>
      </StorySection>

      <StorySection
        title="Operating rules"
        description="This scope keeps Storybook useful as a design-system tool instead of drifting into an app-shell sandbox."
      >
        <div className="grid gap-4 md:grid-cols-3">
          <StoryMetric
            label="Runtime boundary"
            value="No admin app boot"
            description="Preview wiring applies DOM theme and shared providers only. It does not initialize admin stores, i18n boot, or app-level providers."
          />
          <StoryMetric
            label="Story ownership"
            value="Shared packages first"
            description="The source of truth lives in packages/ui and packages/hooks. App-specific shell stories are intentionally out of scope for this pass."
          />
          <StoryMetric
            label="Placement rule"
            value="Centralized stories"
            description="Stories stay in apps/admin/stories so component docs remain curated rather than colocated beside production files."
          />
        </div>
      </StorySection>

      <StorySection
        title="Repo alignment"
        description="The library surface here should stay consistent with repository guidance and package ownership."
      >
        <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
          <StoryNote>
            Align component decisions with{" "}
            <InlineCode>docs/guidelines/frontend-design.md</InlineCode> and placement rules with{" "}
            <InlineCode>docs/guidelines/frontend-folder-architecture.md</InlineCode>.
          </StoryNote>
          <StoryNote>
            Shared tokens and theme behavior come from{" "}
            <InlineCode>@arclayer/ui/tokens.css</InlineCode>,{" "}
            <InlineCode>@arclayer/ui/theme-mode</InlineCode>, and package exports rather than
            admin-only wrappers.
          </StoryNote>
        </div>
      </StorySection>
    </StoryPage>
  );
}

const meta = {
  title: "Introduction/Overview",
  component: StorybookOverview,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Overview of the shared-package Storybook boundary, the section taxonomy, and the rules that keep this workspace focused on packages/ui rather than admin page shells.",
      },
    },
  },
} satisfies Meta<typeof StorybookOverview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Landing: Story = {};
