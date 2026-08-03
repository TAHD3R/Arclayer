import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Tabs, TabsList, TabsTrigger } from "@arclayer/ui/tabs";

describe("Tabs", () => {
  it("uses the taller default list and emphasizes the selected trigger", () => {
    render(
      <Tabs defaultValue="first">
        <TabsList aria-label="Example tabs">
          <TabsTrigger value="first">First</TabsTrigger>
          <TabsTrigger value="second">Second</TabsTrigger>
        </TabsList>
      </Tabs>,
    );

    expect(screen.getByRole("tablist", { name: "Example tabs" })).toHaveClass("h-10");
    expect(screen.getByRole("tab", { name: "First" })).toHaveClass(
      "data-[state=active]:font-semibold",
    );
  });
});
