import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";

import { buildSupportedLocaleOptions, SUPPORTED_LOCALES, type AppLocale } from "@/lib/i18n";
import { usePreferencesStore } from "@/stores/use-preference-store";
import { Button } from "@arclayer/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItemContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@arclayer/ui/dropdown-menu";
import { LocaleFlag } from "@/components/ui/tags";

export function AdminLocaleToggle(props: { className?: string }) {
  const locale = usePreferencesStore((s) => s.locale);
  const setLocale = usePreferencesStore((s) => s.setLocale);
  const { t } = useTranslation();
  const localeOptions = buildSupportedLocaleOptions(SUPPORTED_LOCALES, t);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={t("auth:SWITCH_LANGUAGE")}
          variant="ghost"
          size="icon-lg"
          className={props.className}
        >
          <Languages size={18} className="text-current" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={locale} onValueChange={(val) => setLocale(val as AppLocale)}>
          {localeOptions.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              <DropdownMenuItemContent
                icon={<LocaleFlag locale={option.value} className="text-[1rem]" />}
              >
                {option.label}
              </DropdownMenuItemContent>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
