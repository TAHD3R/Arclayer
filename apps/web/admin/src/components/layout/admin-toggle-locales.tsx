import { Button, Space } from "antd";
import { Icon } from "@iconify/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { AppLocale } from "@/lib/i18n";
import { usePreferencesStore } from "@/stores/use-preference-store";
import LanguagesIcon from "@/components/ui/icons/languages-icon";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";

export function AdminLocaleToggle(props: { className?: string }) {
  const locale = usePreferencesStore((s) => s.locale);
  const setLocale = usePreferencesStore((s) => s.setLocale);
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={t("auth:SWITCH_LANGUAGE")}
          type="text"
          size="large"
          className={props.className}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          icon={<LanguagesIcon size={18} isHovered={hovered} className="text-current" />}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={locale} onValueChange={(val) => setLocale(val as AppLocale)}>
          <DropdownMenuRadioItem value="zh-CN">
            <Space size={10}>
              <Icon icon="twemoji:flag-china" width={18} height={18} />
              <span>简体中文</span>
            </Space>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="en-US">
            <Space size={10}>
              <Icon icon="twemoji:flag-united-states" width={18} height={18} />
              <span>English</span>
            </Space>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
