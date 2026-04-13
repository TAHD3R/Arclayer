import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "@arclayer/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@arclayer/ui/card";
import { Input } from "@arclayer/ui/input";

import {
  InlineCode,
  StoryMetric,
  StoryNote,
  StoryPage,
  StorySection,
} from "../_internal/storybook-docs";

function ThemeModesStory() {
  return (
    <StoryPage
      eyebrow="Theme contract"
      title="Theme behavior is driven by shared tokens, not app-local resets."
      description={
        <>
          Use the Storybook toolbar to switch light and dark modes. The preview applies{" "}
          <InlineCode>data-theme</InlineCode> directly to the document so shared controls respond
          through package-owned tokens and Tailwind semantics.
        </>
      }
    >
      <StorySection
        title="Theme sanity surface"
        description="These surfaces should remain legible, balanced, and semantically consistent across both theme modes."
      >
        <div className="grid gap-10 xl:grid-cols-[1.2fr_0.8fr]">
          <Card className="rounded-3xl">
            <CardHeader className="gap-3">
              <CardTitle className="text-title3 text-label-primary">Control surface</CardTitle>
              <CardDescription>
                Buttons, inputs, borders, and text contrast should all react to the same semantic
                token system.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border bg-background p-5">
                <div className="text-headline text-label-primary">Primary action</div>
                <div className="text-footnote text-label-secondary mt-2">
                  Accent and default actions should stay readable without per-page overrides.
                </div>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Button>Publish changes</Button>
                  <Button variant="outline">Secondary action</Button>
                </div>
              </div>
              <div className="rounded-2xl border bg-background p-5">
                <div className="text-headline text-label-primary">Input surface</div>
                <div className="text-footnote text-label-secondary mt-2">
                  Placeholder, ring, and border semantics should be theme-aware out of the box.
                </div>
                <div className="mt-5">
                  <Input defaultValue="shared-component@arclayer.dev" />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-8">
            <StoryMetric
              label="Preview rule"
              value="Toolbar-driven, package-backed"
              description={
                <>
                  Theme switching here validates <InlineCode>@arclayer/ui/tokens.css</InlineCode>{" "}
                  and shared component semantics, not admin app runtime behavior.
                </>
              }
            />
            <StoryMetric
              label="Review checklist"
              value="Hierarchy, borders, affordance"
              description="Check semantic foreground hierarchy, border readability, control affordance, and surface separation before shipping a new shared component."
            />
            <StoryNote>
              If a control looks wrong in one theme, the first debugging stop should be the token
              source or shared primitive, not a page-level patch.
            </StoryNote>
          </div>
        </div>
      </StorySection>
    </StoryPage>
  );
}

const meta = {
  title: "Theme/Theme Modes",
  component: ThemeModesStory,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Theme validation surface for packages/ui. Use the preview toolbar to verify that shared components react to shared tokens instead of app-local styling.",
      },
    },
  },
} satisfies Meta<typeof ThemeModesStory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {};
