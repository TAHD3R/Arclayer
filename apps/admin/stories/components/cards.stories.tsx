import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "@arclayer/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@arclayer/ui/card";

function CardsStory() {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card className="rounded-3xl">
        <CardHeader>
          <CardTitle className="text-title3 text-label-primary">Editorial workspace</CardTitle>
          <CardDescription>
            A dense panel with clear hierarchy, primary action, and supporting description.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="rounded-2xl border bg-background p-4 text-footnote text-label-secondary">
            Cards should give structured breathing room without forcing page-local spacing rules.
          </div>
          <div className="rounded-2xl border bg-background p-4 text-footnote text-label-secondary">
            Keep title, description, and body rhythm consistent across consuming apps.
          </div>
        </CardContent>
        <CardFooter className="gap-3">
          <Button>Open editor</Button>
          <Button variant="outline">Inspect metadata</Button>
        </CardFooter>
      </Card>

      <Card className="rounded-3xl">
        <CardHeader>
          <CardTitle className="text-title3 text-label-primary">Review checklist</CardTitle>
          <CardDescription>
            Surface components should be validated for hierarchy, padding rhythm, and footer action
            spacing.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-footnote text-label-secondary">
          <div className="rounded-2xl border bg-background p-4">
            Title and body spacing stays stable.
          </div>
          <div className="rounded-2xl border bg-background p-4">
            Support copy remains readable in both theme modes.
          </div>
          <div className="rounded-2xl border bg-background p-4">
            Footer actions align with shared button semantics.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const meta = {
  title: "Components/Cards",
  component: CardsStory,
  parameters: {
    docs: {
      description: {
        component:
          "Representative card surfaces for validating spacing rhythm, semantic hierarchy, and footer composition in shared UI.",
      },
    },
  },
} satisfies Meta<typeof CardsStory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {};
