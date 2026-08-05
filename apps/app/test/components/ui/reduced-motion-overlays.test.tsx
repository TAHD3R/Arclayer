import { render, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@arclayer/ui/combobox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem } from "@arclayer/ui/dropdown-menu";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@arclayer/ui/hover-card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";

const REDUCED_MOTION_CLASSES = [
  "motion-reduce:animate-none!",
  "motion-reduce:transition-none!",
] as const;

describe("overlay reduced-motion contracts", () => {
  it("makes Select keyframe suppression authoritative", async () => {
    render(
      <Select open value="one">
        <SelectTrigger aria-label="Choice">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="one">One</SelectItem>
        </SelectContent>
      </Select>,
    );

    await expectOverlayClasses("select-content");
  });

  it("makes DropdownMenu keyframe suppression authoritative", async () => {
    render(
      <DropdownMenu open>
        <DropdownMenuContent>
          <DropdownMenuItem>Open</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    await expectOverlayClasses("dropdown-menu-content");
  });

  it("makes HoverCard keyframe suppression authoritative", async () => {
    render(
      <HoverCard open>
        <HoverCardTrigger asChild>
          <button type="button">Credits</button>
        </HoverCardTrigger>
        <HoverCardContent>Credit balance</HoverCardContent>
      </HoverCard>,
    );

    await expectOverlayClasses("hover-card-content");
  });

  it("makes Combobox keyframe suppression authoritative", async () => {
    render(
      <Combobox open items={["One"]}>
        <ComboboxInput aria-label="Choice" />
        <ComboboxContent>
          <ComboboxList>
            <ComboboxItem value="One">One</ComboboxItem>
          </ComboboxList>
        </ComboboxContent>
      </Combobox>,
    );

    await expectOverlayClasses("combobox-content");
  });
});

async function expectOverlayClasses(slot: string) {
  await waitFor(() => {
    const content = document.querySelector(`[data-slot="${slot}"]`);
    expect(content).not.toBeNull();
    expect(content).toHaveClass(...REDUCED_MOTION_CLASSES);
  });
}
