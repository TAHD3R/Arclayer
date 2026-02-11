import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";

import { Accordion } from "@/components/ui/accordion";
import { SettingAccordionItem } from "@/components/common/setting-accordion-item";
import { DEFAULT_LOCALE, initI18n } from "@/lib/i18n";

beforeAll(async () => {
  await initI18n(DEFAULT_LOCALE);
});

describe("SettingAccordionItem", () => {
  it("does not render summary when summary is empty (avoid 'Current: -')", () => {
    render(
      <Accordion type="single" collapsible>
        <SettingAccordionItem value="a" title="Title" showSummary>
          <div>content</div>
        </SettingAccordionItem>
      </Accordion>,
    );

    // Summary prefix is rendered in DOM (sr-only), so we can assert it is absent.
    expect(screen.queryByText("当前：")).not.toBeInTheDocument();
    expect(screen.queryByText("Current:")).not.toBeInTheDocument();
  });

  it("treats '-' as empty summary and does not render it", () => {
    render(
      <Accordion type="single" collapsible>
        <SettingAccordionItem value="a" title="Title" showSummary summary="-">
          <div>content</div>
        </SettingAccordionItem>
      </Accordion>,
    );

    expect(screen.queryByText("当前：")).not.toBeInTheDocument();
    expect(screen.queryByText("Current:")).not.toBeInTheDocument();
  });
});
