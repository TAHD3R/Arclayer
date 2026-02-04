import { Button, Dropdown, Space } from "antd";
import { Icon } from "@iconify/react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { AppLocale } from "@/lib/i18n";
import { usePreferencesStore } from "@/stores/use-preference-store";
import LanguagesIcon from "@/components/ui/icons/languages-icon";

export function AdminLocaleToggle(props: { className?: string }) {
  const locale = usePreferencesStore((s) => s.locale);
  const setLocale = usePreferencesStore((s) => s.setLocale);
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);

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
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        icon={<LanguagesIcon size={18} isHovered={hovered} className="text-current" />}
      />
    </Dropdown>
  );
}
