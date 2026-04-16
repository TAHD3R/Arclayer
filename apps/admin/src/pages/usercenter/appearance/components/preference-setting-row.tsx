import type { ReactNode } from "react";

import { SettingCard, SettingCardHeader } from "@arclayer/ui/setting-card";

type PreferenceSettingRowProps = {
  title: ReactNode;
  description: ReactNode;
  action: ReactNode;
};

export function PreferenceSettingRow(props: PreferenceSettingRowProps) {
  return (
    <SettingCard>
      <SettingCardHeader
        title={props.title}
        description={props.description}
        action={props.action}
      />
    </SettingCard>
  );
}
