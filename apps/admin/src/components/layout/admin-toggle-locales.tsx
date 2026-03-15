import { Icon } from "@iconify/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { AppLocale } from "@/lib/i18n";
import { usePreferencesStore } from "@/stores/use-preference-store";
import { Button } from "@celestial/ui/button";
import LanguagesIcon from "@celestial/ui/icons/languages-icon";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItemContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@celestial/ui/dropdown-menu";

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
          variant="ghost"
          size="icon-lg"
          className={props.className}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <LanguagesIcon size={18} isHovered={hovered} className="text-current" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={locale} onValueChange={(val) => setLocale(val as AppLocale)}>
          <DropdownMenuRadioItem value="zh-CN">
            <DropdownMenuItemContent
              icon={<Icon icon="twemoji:flag-china" width={18} height={18} />}
            >
              简体中文
            </DropdownMenuItemContent>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="en-US">
            <DropdownMenuItemContent
              icon={<Icon icon="twemoji:flag-united-states" width={18} height={18} />}
            >
              English
            </DropdownMenuItemContent>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
