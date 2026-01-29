import type { FormInstance } from "antd";

import type { GeneralSettingsFormValues } from "./types";

export type GeneralSettingsPatchFn = (patch: Record<string, unknown>) => Promise<void>;

export type WithSavingKeyFn = (key: string, fn: () => Promise<void>) => Promise<void>;

export type GeneralSettingsTabBaseProps = {
  form: FormInstance<GeneralSettingsFormValues>;
  initialValues: GeneralSettingsFormValues;
  disabled: boolean;
  savingKey: string | null;
  withSavingKey: WithSavingKeyFn;
  patch: GeneralSettingsPatchFn;
};
