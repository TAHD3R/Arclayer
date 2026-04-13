import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "@arclayer/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@arclayer/ui/card";
import {
  ChromeTabs,
  ChromeTabsBar,
  ChromeTabsContent,
  ChromeTabsList,
  ChromeTabsProvider,
  ChromeTabsTrigger,
} from "@arclayer/ui/chrome-tabs";
import { DirectionProvider } from "@arclayer/ui/direction";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@arclayer/ui/tooltip";

function DirectionProviderDemo() {
  const [direction, setDirection] = useState<"ltr" | "rtl">("ltr");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-headline text-label-primary">DirectionProvider</CardTitle>
        <CardDescription>
          Use when a surface or subtree needs explicit LTR/RTL behavior.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-3">
          <Button
            variant={direction === "ltr" ? "default" : "outline"}
            onClick={() => setDirection("ltr")}
          >
            LTR
          </Button>
          <Button
            variant={direction === "rtl" ? "default" : "outline"}
            onClick={() => setDirection("rtl")}
          >
            RTL
          </Button>
        </div>
        <DirectionProvider dir={direction} direction={direction}>
          <div
            dir={direction}
            className="rounded-2xl border bg-background p-4 text-footnote text-label-secondary"
          >
            Current direction: <strong className="text-label-primary">{direction}</strong>
          </div>
        </DirectionProvider>
      </CardContent>
    </Card>
  );
}

function TooltipProviderDemo() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-headline text-label-primary">TooltipProvider</CardTitle>
        <CardDescription>
          Controls shared tooltip timing and interaction behavior for a subtree.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <TooltipProvider openDelay={120}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline">Hover for guidance</Button>
            </TooltipTrigger>
            <TooltipContent>Keep helper text short and intentional.</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}

function ChromeTabsProviderDemo() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-headline text-label-primary">ChromeTabsProvider</CardTitle>
        <CardDescription>
          Required for chrome-tab labels and reduced-motion handling.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChromeTabsProvider
          labels={{
            scrollLeftAriaLabel: "Scroll tabs left",
            scrollRightAriaLabel: "Scroll tabs right",
          }}
        >
          <ChromeTabs defaultValue="overview">
            <ChromeTabsBar
              left={
                <ChromeTabsList aria-label="Provider demo tabs">
                  <ChromeTabsTrigger value="overview">Overview</ChromeTabsTrigger>
                  <ChromeTabsTrigger value="usage">Usage</ChromeTabsTrigger>
                  <ChromeTabsTrigger value="notes">Notes</ChromeTabsTrigger>
                </ChromeTabsList>
              }
              right={
                <Button variant="ghost" size="sm">
                  Inspect
                </Button>
              }
            />
            <ChromeTabsContent value="overview" className="text-footnote text-label-secondary">
              Providers should make required runtime contracts explicit instead of hiding them in
              app boot code.
            </ChromeTabsContent>
            <ChromeTabsContent value="usage" className="text-footnote text-label-secondary">
              Chrome tabs remain package-owned even when consumed inside product shells.
            </ChromeTabsContent>
            <ChromeTabsContent value="notes" className="text-footnote text-label-secondary">
              Missing this provider should fail loudly because labels are a real accessibility
              contract.
            </ChromeTabsContent>
          </ChromeTabs>
        </ChromeTabsProvider>
      </CardContent>
    </Card>
  );
}

function ProvidersOverview() {
  return (
    <div className="bg-background min-h-screen">
      <div className="mx-auto flex max-w-6xl flex-col gap-12 px-8 py-12 md:px-12">
        <section className="mx-auto flex max-w-4xl flex-col gap-5">
          <div className="text-caption text-label-secondary">Provider contracts</div>
          <h1 className="text-title2 tracking-[-0.03em] text-balance">
            Providers make runtime requirements explicit and reviewable.
          </h1>
          <p className="text-callout text-label-secondary max-w-4xl leading-8">
            Shared providers belong in component documentation because they define real behavior
            contracts. They should not be hidden behind unrelated app boot sequences.
          </p>
        </section>

        <div className="grid gap-5 xl:grid-cols-3">
          <DirectionProviderDemo />
          <TooltipProviderDemo />
          <ChromeTabsProviderDemo />
        </div>
      </div>
    </div>
  );
}

const meta = {
  title: "Providers/Overview",
  component: ProvidersOverview,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Runtime provider reference for shared UI. These examples document required context explicitly so failures remain visible and reviewable.",
      },
    },
  },
} satisfies Meta<typeof ProvidersOverview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {};
