import type { Meta, StoryObj } from "@storybook/react-vite";

import {
  InlineCode,
  StoryLinkItem,
  StoryNote,
  StoryPage,
  StorySection,
  TokenSwatch,
} from "../_internal/storybook-docs";

const colorTokens = [
  {
    label: "Background",
    token: "--background",
    usage: "Canvas and neutral surfaces",
    valueStyle: { background: "hsl(var(--background))" },
  },
  {
    label: "Card",
    token: "--card",
    usage: "Elevated containers and grouped regions",
    valueStyle: { background: "hsl(var(--card))" },
  },
  {
    label: "Primary",
    token: "--primary",
    usage: "Primary call-to-action and focus brand",
    valueStyle: { background: "hsl(var(--primary))" },
  },
  {
    label: "Accent",
    token: "--accent",
    usage: "Hover layers and secondary emphasis",
    valueStyle: { background: "hsl(var(--accent))" },
  },
  {
    label: "Border",
    token: "--border",
    usage: "Container separation and control outlines",
    valueStyle: { background: "hsl(var(--border))" },
  },
  {
    label: "Label Secondary",
    token: "--muted-foreground",
    usage: "Supporting copy and annotations",
    valueStyle: { background: "hsl(var(--muted-foreground))" },
  },
] as const;

const typographyScale = [
  {
    name: "Large Title",
    className: "text-largetitle",
    description: "Hero-level page titles and rare emphasis.",
  },
  {
    name: "Title",
    className: "text-title",
    description: "Primary page headers and major system statements.",
  },
  {
    name: "Title 2",
    className: "text-title2",
    description: "Section headers and dense product summaries.",
  },
  {
    name: "Title 3",
    className: "text-title3",
    description: "Panel titles and sub-section landmarks.",
  },
  {
    name: "Headline",
    className: "text-headline",
    description: "Component headers and emphasis text inside cards.",
  },
  {
    name: "Body",
    className: "text-body",
    description: "Default reading text for forms and documentation.",
  },
  {
    name: "Callout",
    className: "text-callout",
    description: "Compact descriptive copy paired with controls.",
  },
  {
    name: "Footnote",
    className: "text-footnote",
    description: "Supportive metadata and dense explanatory UI.",
  },
  {
    name: "Caption",
    className: "text-caption",
    description: "Eyebrows, helper labels, and low-emphasis metadata.",
  },
] as const;

function TokensStory() {
  return (
    <StoryPage
      eyebrow="Design system"
      title="The shared UI contract is semantic: tokens first, raw values last."
      description={
        <>
          Shared UI should consume semantic tokens from{" "}
          <InlineCode>@arclayer/ui/tokens.css</InlineCode> and the Tailwind preset, not page-local
          hex values or ad-hoc font sizing. These references are the review surface for that
          contract.
        </>
      }
    >
      <StorySection
        title="Semantic color tokens"
        description="Use semantic names for intent. Components should not hardcode palette values when a shared token already captures the meaning."
      >
        <div className="grid gap-1">
          {colorTokens.map((token) => (
            <TokenSwatch key={token.token} {...token} />
          ))}
        </div>
      </StorySection>

      <StorySection
        title="Typography scale"
        description="Typography classes encode both size and rhythm. Prefer these semantic classes over ad-hoc pixel sizing."
      >
        <div className="grid gap-5">
          {typographyScale.map((item) => (
            <div
              key={item.name}
              className="border-border/70 grid gap-2 border-b pb-5 last:border-b-0 last:pb-0 lg:grid-cols-[220px_1fr]"
            >
              <div className="text-caption text-label-secondary">{item.name}</div>
              <div className="space-y-2">
                <div className={item.className}>The quick brown fox jumps over the lazy dog.</div>
                <div className="text-footnote text-label-secondary">{item.description}</div>
              </div>
            </div>
          ))}
        </div>
      </StorySection>

      <StorySection
        title="Implementation guidance"
        description="These are the guardrails that keep shared components consistent across consuming apps."
      >
        <div className="grid gap-2">
          <StoryLinkItem
            title="Prefer semantic classes"
            description={
              <>
                Use classes like <InlineCode>text-footnote</InlineCode> and{" "}
                <InlineCode>text-label-secondary</InlineCode> instead of raw{" "}
                <InlineCode>text-sm</InlineCode> or literal color values.
              </>
            }
            hrefLabel="Guideline"
          />
          <StoryLinkItem
            title="Let tokens own theme changes"
            description="Theme mode switches should flow through CSS variables and shared component styles rather than app-specific resets."
            hrefLabel="Guideline"
          />
          <StoryLinkItem
            title="Review shared primitives first"
            description="If a visual inconsistency appears across pages, inspect the shared package component or token source before patching page-local JSX."
            hrefLabel="Guideline"
          />
        </div>
        <StoryNote>
          The point of this page is to document the system contract. It should read like a
          foundation spec, not a component marketing page.
        </StoryNote>
      </StorySection>
    </StoryPage>
  );
}

const meta = {
  title: "Design System/Tokens",
  component: TokensStory,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Design-system reference for the semantic token contract in @arclayer/ui, covering color, typography, and implementation guidance.",
      },
    },
  },
} satisfies Meta<typeof TokensStory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {};
