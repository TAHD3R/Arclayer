import { Button, Dropdown, Space } from "antd";
import { Languages } from "lucide-react";
import { Icon } from "@iconify/react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { AppLocale } from "@/core/i18n";
import { usePreferencesStore } from "@/stores/preferences.store";

export function AdminLocaleToggle(props: { className?: string }) {
  const locale = usePreferencesStore((s) => s.locale);
  const setLocale = usePreferencesStore((s) => s.setLocale);
  const { t } = useTranslation();

  const items = useMemo(
    () => [
      {
        key: "zh-CN",
        label: (
          <Space size={10}>
            <Icon icon="twemoji:flag-china" width={18} height={18} />
            <span>简体中文</span>
          </Space>
        ),
      },
      {
        key: "en-US",
        label: (
          <Space size={10}>
            <Icon icon="twemoji:flag-united-states" width={18} height={18} />
            <span>English</span>
          </Space>
        ),
      },
    ],
    [],
  );

  return (
    <Dropdown
      menu={{
        items,
        selectable: true,
        selectedKeys: [locale],
        onClick: (info) => setLocale(info.key as AppLocale),
      }}
      trigger={["click"]}
    >
      <Button
        aria-label={t("auth:SWITCH_LANGUAGE")}
        type="text"
        size="large"
        className={props.className}
        style={{ width: 44, height: 44, paddingInline: 0 }}
        icon={<Languages size={18} />}
      />
    </Dropdown>
  );
}
