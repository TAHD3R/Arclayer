import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { useControlledState } from "@arclayer/hooks/use-controlled-state";
import { useMediaQuery } from "@arclayer/hooks/use-media-query";
import { useToggle } from "@arclayer/hooks/use-toggle";
import { Button } from "@arclayer/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@arclayer/ui/card";

function ToggleDemo() {
  const [enabled, toggle] = useToggle(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-headline text-label-primary">useToggle</CardTitle>
        <CardDescription>
          Simple boolean toggling for disclosure, selection, and feature flips.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-2xl border bg-background p-4 text-footnote text-label-secondary">
          Current value: <strong className="text-label-primary">{String(enabled)}</strong>
        </div>
        <Button onClick={toggle}>{enabled ? "Disable" : "Enable"}</Button>
      </CardContent>
    </Card>
  );
}

function ControlledStateDemo() {
  const [externalValue, setExternalValue] = useState<"grid" | "list">("grid");
  const [value, setValue] = useControlledState({
    value: externalValue,
    onChange: setExternalValue,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-headline text-label-primary">useControlledState</CardTitle>
        <CardDescription>
          Bridge controlled and uncontrolled behavior without duplicating state logic.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-2xl border bg-background p-4 text-footnote text-label-secondary">
          Active view: <strong className="text-label-primary">{value}</strong>
        </div>
        <div className="flex gap-3">
          <Button
            variant={value === "grid" ? "default" : "outline"}
            onClick={() => setValue("grid")}
          >
            Grid
          </Button>
          <Button
            variant={value === "list" ? "default" : "outline"}
            onClick={() => setValue("list")}
          >
            List
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function MediaQueryDemo() {
  const matchesDesktop = useMediaQuery("(min-width: 1024px)");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-headline text-label-primary">useMediaQuery</CardTitle>
        <CardDescription>
          React to real viewport state in Storybook without wiring app-level layout state.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-2xl border bg-background p-4 text-footnote text-label-secondary">
          <div>
            Query: <code>(min-width: 1024px)</code>
          </div>
          <div className="mt-2">
            Matches desktop:{" "}
            <strong className="text-label-primary">{String(matchesDesktop)}</strong>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function HooksOverview() {
  return (
    <div className="bg-background min-h-screen">
      <div className="mx-auto flex max-w-6xl flex-col gap-12 px-8 py-12 md:px-12">
        <section className="mx-auto flex max-w-4xl flex-col gap-5">
          <div className="text-caption text-label-secondary">Shared hooks</div>
          <h1 className="text-title2 tracking-[-0.03em] text-balance">
            Hooks should be documented through behavior, not API signatures alone.
          </h1>
          <p className="text-callout text-label-secondary max-w-4xl leading-8">
            These demos cover reusable state patterns from <code>@arclayer/hooks</code> that are
            commonly paired with shared UI primitives.
          </p>
        </section>

        <div className="grid gap-5 xl:grid-cols-3">
          <ToggleDemo />
          <ControlledStateDemo />
          <MediaQueryDemo />
        </div>
      </div>
    </div>
  );
}

const meta = {
  title: "Hooks/Overview",
  component: HooksOverview,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Behavioral demos for shared hooks in @arclayer/hooks. These stories focus on state flow and runtime semantics instead of raw signatures.",
      },
    },
  },
} satisfies Meta<typeof HooksOverview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {};
