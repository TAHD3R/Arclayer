import { useTranslation } from "react-i18next";

import { Accordion } from "@celestial/ui/accordion";
import { SettingAccordionItem } from "@celestial/ui/setting-accordion-item";
import { SettingPanel } from "@celestial/ui/setting-panel";

export function PlaceholderPoliciesPanel(props: {
  title: string;
  description: string;
  items: Array<{ title: string; description: string }>;
}) {
  const { t } = useTranslation(["common"]);
  return (
    <SettingPanel title={props.title} description={props.description}>
      <Accordion type="single" collapsible className="rounded-lg border border-border">
        {props.items.map((it, idx) => (
          <SettingAccordionItem
            key={`${it.title}-${idx}`}
            value={`placeholder-${idx}`}
            variant="action"
            title={it.title}
            description={it.description}
            disabled
            showSummary={false}
          >
            <div className="text-callout text-label-secondary">
              {t("common:PAGE_COMING_SOON_DESC")}
            </div>
          </SettingAccordionItem>
        ))}
      </Accordion>
    </SettingPanel>
  );
}
